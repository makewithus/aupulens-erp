import { deferUntilAccountingCommit, getAccountingSession } from "@/lib/accounting/transaction";

/**
 * A dependency-light wrapper for emitting AI runtime events from real business logic
 * (docs/ai/BRIEF-02-BATCH-A.md B.2). This file has NO top-level imports of anything that
 * touches `lib/db.ts` — that module throws at MODULE LOAD time if `MONGODB_URI` is unset,
 * which would otherwise break any existing test that imports a business-logic file (e.g.
 * `lib/accounting/posting.ts`) without needing a real DB connection.
 *
 * TRANSACTIONAL OUTBOX
 * `safeEmitEvent()` never executes AI workflows inside a user request. It only writes a durable
 * `pending` row to the `AiEvent` outbox; `sweepPendingEvents()` (scheduler) drains it.
 *
 *  - Inside `withAccountingTransaction` (journal posting, invoices, bills, ...) the row is written
 *    IN THE SAME MongoDB TRANSACTION as the business data (mongoose's transactionAsyncLocalStorage
 *    attaches the session). Commit => business data AND event exist; rollback => neither. A failed
 *    write throws and aborts the business transaction rather than silently dropping the event.
 *  - Outside a transaction (single-document CRUD such as master-data changes) no atomic guarantee
 *    is possible, because the business write has already committed. The insert is retried, any
 *    final failure is logged with structure and counted (see getOutboxInsertFailures), and it is
 *    NOT rethrown: throwing after a committed write would make clients retry and duplicate the
 *    business record. Recovery for that residual gap is the continuous re-derivation done by the
 *    hourly `ai.sweep.hourly` / `period.horizon.reached` workflows.
 */

/** Event keys whose loss would hide a financial fact from the AI workflows. */
export const CRITICAL_EVENT_PREFIXES = ["journal.", "invoice.", "bill.", "bank.", "payment."];
export const isCriticalEvent = (eventKey: string) => CRITICAL_EVENT_PREFIXES.some((p) => eventKey.startsWith(p));

let insertFailures = 0;
let criticalInsertFailures = 0;
export function getOutboxInsertFailures() {
  return { total: insertFailures, critical: criticalInsertFailures };
}
export function resetOutboxInsertFailures() {
  insertFailures = 0;
  criticalInsertFailures = 0;
}

const OUTSIDE_TX_ATTEMPTS = 3;

async function persistEvent(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string } | undefined,
  inTransaction: boolean,
): Promise<void> {
  const connectDB = (await import("@/lib/db")).default;
  const AiEvent = (await import("@/models/ai/AiEvent")).default;
  const { AI_EVENT_STATUS } = await import("@/lib/constants/statuses");
  const crypto = await import("crypto");
  await connectDB();

  if (opts?.dedupeKey) {
    // Idempotent upsert on the unique {tenantId,eventKey,dedupeKey} index: safe under concurrency and,
    // unlike create()+catch(E11000), it does not abort an enclosing transaction on a duplicate.
    await AiEvent.updateOne(
      { tenantId, eventKey, dedupeKey: opts.dedupeKey },
      { $setOnInsert: { payload, status: AI_EVENT_STATUS.PENDING, attempts: 0 } },
      { upsert: true },
    ).catch((err: unknown) => {
      if (!inTransaction && (err as { code?: number })?.code === 11000) return; // concurrent identical emit: already stored
      throw err;
    });
    return;
  }
  await AiEvent.create({ tenantId, eventKey, payload, dedupeKey: crypto.randomUUID(), status: AI_EVENT_STATUS.PENDING });
}

export async function safeEmitEvent(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
  opts?: { dedupeKey?: string; dispatchInline?: boolean },
): Promise<void> {
  if (opts?.dispatchInline) {
    if (deferUntilAccountingCommit(() => safeEmitEvent(tenantId, eventKey, payload, opts))) return;
    try {
      const { bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap");
      const { emitEvent } = await import("@/lib/aiRuntime/runtime/eventBus");
      bootstrapAiRuntime();
      await emitEvent(tenantId, eventKey, payload, opts);
    } catch {
      // Inline dispatch is best-effort by design; the durable row (written by emitEvent first) is swept later.
    }
    return;
  }

  if (getAccountingSession()) {
    // Same transaction as the business write: errors MUST propagate so the transaction aborts.
    await persistEvent(tenantId, eventKey, payload, opts, true);
    return;
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= OUTSIDE_TX_ATTEMPTS; attempt++) {
    try {
      await persistEvent(tenantId, eventKey, payload, opts, false);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  insertFailures += 1;
  const critical = isCriticalEvent(eventKey);
  if (critical) criticalInsertFailures += 1;
  console.error(
    JSON.stringify({
      level: "error",
      msg: "ai-outbox: failed to persist event",
      tenantId,
      eventKey,
      critical,
      attempts: OUTSIDE_TX_ATTEMPTS,
      error: lastErr instanceof Error ? lastErr.message : String(lastErr),
    }),
  );
}

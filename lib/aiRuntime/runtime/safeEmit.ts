import { deferUntilAccountingCommit } from "@/lib/accounting/transaction";
/**
 * A dependency-light wrapper for emitting AI runtime events from real business logic
 * (docs/ai/BRIEF-02-BATCH-A.md B.2). This file has NO top-level imports of anything that
 * touches `lib/db.ts` — that module throws at MODULE LOAD time if `MONGODB_URI` is unset,
 * which would otherwise break any existing test that imports a business-logic file (e.g.
 * `lib/accounting/posting.ts`) without needing a real DB connection.
 *
 * RESOURCE OPTIMIZATION (Phase 1.2):
 * Previously, this imported `bootstrapAiRuntime` and synchronously executed the AI event bus
 * and workflow execution on every business CRUD operation.
 * Now, `safeEmitEvent()` writes directly to the durable `AiEvent` outbox table as `pending`,
 * without loading the 128 workflow files or executing AI workflows inline inside user requests.
 * The background worker (`app/api/cron/ai/runtime-sweep/route.ts`) drains the outbox asynchronously.
 */
export async function safeEmitEvent(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
  opts?: { dedupeKey?: string; dispatchInline?: boolean },
): Promise<void> {
  if (deferUntilAccountingCommit(() => safeEmitEvent(tenantId, eventKey, payload, opts))) return;
  try {
    if (opts?.dispatchInline) {
      const { bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap");
      const { emitEvent } = await import("@/lib/aiRuntime/runtime/eventBus");
      bootstrapAiRuntime();
      await emitEvent(tenantId, eventKey, payload, opts);
      return;
    }

    const connectDB = (await import("@/lib/db")).default;
    const AiEvent = (await import("@/models/ai/AiEvent")).default;
    const { AI_EVENT_STATUS } = await import("@/lib/constants/statuses");
    const crypto = await import("crypto");

    await connectDB();
    const dedupeKey = opts?.dedupeKey || crypto.randomUUID();

    if (opts?.dedupeKey) {
      const existing = await AiEvent.findOne({ tenantId, eventKey, dedupeKey }).lean();
      if (existing) return;
    }

    try {
      await AiEvent.create({
        tenantId,
        eventKey,
        payload,
        dedupeKey,
        status: AI_EVENT_STATUS.PENDING,
      });
    } catch (err: unknown) {
      // Catch duplicate key error gracefully if concurrent emissions with the same dedupeKey collide
      const isDup = typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
      if (!isDup) throw err;
    }
  } catch {
    // Swallowed by design — see file header. The AI runtime's own sweep/DLQ (Chunk 1)
    // covers real recovery for genuinely dropped events in production; this path only
    // protects the caller from a broken/unconfigured runtime.
  }
}

import crypto from "crypto";
import connectDB from "@/lib/db";
import AiEvent from "@/models/ai/AiEvent";
import { AI_EVENT_STATUS, type AiEventStatus } from "@/lib/constants/statuses";
import { getWorkflowsForEventKey } from "@/lib/aiRuntime/runtime/registry";
import { isWorkflowEnabled } from "@/lib/aiRuntime/runtime/killSwitch";
import { runWorkflow } from "@/lib/aiRuntime/runtime/executor";
import type { TriggerEvent } from "@/lib/aiRuntime/workflows/types";

/**
 * The event bus (Part 2.5). No internal domain-event mechanism existed
 * anywhere in this codebase before this (verified — see
 * docs/ai/SYSTEM_INVENTORY.md) and there is no persistent worker process to
 * host a listener (Vercel Cron only). So: `emitEvent()` persists an outbox
 * row AND attempts inline, synchronous, best-effort dispatch in the same
 * request — this is what makes triggering event-driven rather than
 * click-driven, under a request/response serverless model. Dispatch failures
 * NEVER propagate back to the caller (a business route emitting
 * `invoice.created` must not fail invoice creation because the AI runtime
 * has a bug) — anything left `pending`/`failed` is drained later by
 * app/api/cron/ai/runtime-sweep/route.ts, which is the retry+DLQ mechanism.
 *
 * A workflow's kill switch is checked per-workflow before dispatch — a
 * disabled workflow's matching event is marked `processed` with zero
 * dispatches, not left pending forever (there is nothing to retry if the
 * workflow is deliberately off).
 */

export const MAX_ATTEMPTS = 5;

/** Tunables (env-overridable). Lease must comfortably exceed the longest single workflow run. */
export function outboxConfig() {
  return {
    leaseMs: Number(process.env.AI_EVENT_LEASE_MS) || 5 * 60_000,
    backoffBaseMs: Number(process.env.AI_EVENT_BACKOFF_BASE_MS) || 30_000,
    backoffMaxMs: Number(process.env.AI_EVENT_BACKOFF_MAX_MS) || 60 * 60_000,
  };
}

/** Exponential retry delay after the Nth failed attempt, capped. */
export function computeBackoffMs(attempts: number, cfg = outboxConfig()): number {
  return Math.min(cfg.backoffMaxMs, cfg.backoffBaseMs * 2 ** Math.max(0, attempts - 1));
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export async function emitEvent(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
  opts?: { dedupeKey?: string; dispatchInline?: boolean },
): Promise<{ eventId: string; deduped: boolean }> {
  await connectDB();

  if (opts?.dedupeKey) {
    const existing = await AiEvent.findOne({ tenantId, eventKey, dedupeKey: opts.dedupeKey });
    if (existing) return { eventId: String(existing._id), deduped: true };
  }

  let event;
  try {
    event = await AiEvent.create({
      tenantId,
      eventKey,
      payload,
      dedupeKey: opts?.dedupeKey || crypto.randomUUID(),
      status: AI_EVENT_STATUS.PENDING,
    });
  } catch (err) {
    // The findOne-then-create above isn't atomic — two concurrent emitEvent()
    // calls with the SAME dedupeKey (e.g. the Vercel cron sweep and the
    // opportunistic scheduler trigger both firing for the same hourKey) can
    // both pass the check above and race on create(). The unique index is
    // the real source of truth for "already emitted": a duplicate-key error
    // here means deduplication worked as designed, not a genuine failure —
    // this is the exact live "ai-runtime-sweep failed: E11000..." class of
    // error found in the Scheduled Jobs panel, hardened at its second cause
    // (the first being the sparse/partial index gap fixed on the model).
    if (opts?.dedupeKey && isDuplicateKeyError(err)) {
      const existing = await AiEvent.findOne({ tenantId, eventKey, dedupeKey: opts.dedupeKey });
      if (existing) return { eventId: String(existing._id), deduped: true };
    }
    throw err;
  }

  // Best-effort inline dispatch — never let this throw back to the caller.
  if (opts?.dispatchInline !== false) {
    await dispatchEvent(String(event._id)).catch(() => undefined);
  }

  return { eventId: String(event._id), deduped: false };
}

function claimableFilter(now: Date, leaseMs: number) {
  const staleLegacy = new Date(now.getTime() - leaseMs);
  return {
    $or: [
      // pending / failed and past their backoff
      {
        status: { $in: [AI_EVENT_STATUS.PENDING, AI_EVENT_STATUS.FAILED] },
        attempts: { $lt: MAX_ATTEMPTS },
        $or: [{ nextAttemptAt: { $exists: false } }, { nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
      },
      // crashed worker: lease expired
      { status: AI_EVENT_STATUS.PROCESSING, attempts: { $lt: MAX_ATTEMPTS }, leaseUntil: { $lte: now } },
      // rows stranded in `processing` before leases existed
      { status: AI_EVENT_STATUS.PROCESSING, attempts: { $lt: MAX_ATTEMPTS }, leaseUntil: { $exists: false }, updatedAt: { $lte: staleLegacy } },
    ],
  };
}

/**
 * Atomically claims ONE eligible event (optionally a specific one): a single findOneAndUpdate
 * flips it to `processing`, stamps the worker + lease and increments attempts, so two workers can
 * never hold the same event. Returns null when nothing is claimable.
 */
export async function claimEvent(opts: { workerId: string; eventId?: string; now?: Date }) {
  await connectDB();
  const now = opts.now ?? new Date();
  const { leaseMs } = outboxConfig();
  return AiEvent.findOneAndUpdate(
    { ...(opts.eventId ? { _id: opts.eventId } : {}), ...claimableFilter(now, leaseMs) },
    {
      $set: {
        status: AI_EVENT_STATUS.PROCESSING,
        workerId: opts.workerId,
        leaseUntil: new Date(now.getTime() + leaseMs),
        processingStartedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true },
  );
}

/** Events whose lease expired after the final attempt can never be retried: dead-letter them. */
export async function deadLetterExhausted(now = new Date()): Promise<number> {
  await connectDB();
  const { leaseMs } = outboxConfig();
  const res = await AiEvent.updateMany(
    {
      status: AI_EVENT_STATUS.PROCESSING,
      attempts: { $gte: MAX_ATTEMPTS },
      $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false }, updatedAt: { $lte: new Date(now.getTime() - leaseMs) } }],
    },
    { $set: { status: AI_EVENT_STATUS.DEAD_LETTER, deadLetteredAt: now, lastError: "lease expired after final attempt" } },
  );
  return res.modifiedCount;
}

type ClaimedEvent = NonNullable<Awaited<ReturnType<typeof claimEvent>>>;

/** Runs every registered workflow for an already-claimed event and records the outcome, fenced on the lease owner. */
async function runClaimedEvent(event: ClaimedEvent, now = () => new Date()): Promise<AiEventStatus> {
  const workflows = getWorkflowsForEventKey(event.eventKey);
  const triggerEvent: TriggerEvent = {
    id: String(event._id),
    tenantId: event.tenantId,
    eventKey: event.eventKey,
    payload: event.payload,
  };

  // Ownership contract for shared event keys (docs/ai/BRIEF-04-BATCH-C.md Part 0.2). Only
  // matters when 2+ workflows are registered on this exact key — a sole subscriber needs no
  // filter, there is nothing to disambiguate against. Default is reject: a workflow sharing a
  // key with others but declaring no `subscriptionFilter` is skipped, not silently run.
  const isSharedKey = workflows.length > 1;

  let anyFailed = false;
  let lastError = "";

  for (const workflow of workflows) {
    if (isSharedKey) {
      if (!workflow.subscriptionFilter) continue;
      const owns = await Promise.resolve(workflow.subscriptionFilter(triggerEvent)).catch(() => false);
      if (!owns) continue;
    }

    const enabled = await isWorkflowEnabled(event.tenantId, workflow.id).catch(() => false);
    // Phase 10 Addendum A Part 0: the kill-switch exemption is based on whether the workflow CAN
    // WRITE AT ALL (`performsWrites`), never on autonomy level — see docs/ai/audits/KILLSWITCH_AUDIT.md.
    if (!enabled && workflow.performsWrites) {
      // A disabled workflow that can write must not run at all — fail closed (Hard Rule 6).
      continue;
    }
    try {
      await runWorkflow(workflow, triggerEvent);
    } catch (err) {
      anyFailed = true;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  const finished = now();
  const durationMs = event.processingStartedAt ? finished.getTime() - event.processingStartedAt.getTime() : undefined;
  let set: Record<string, unknown>;
  let finalStatus: AiEventStatus;
  if (anyFailed) {
    if (event.attempts >= MAX_ATTEMPTS) {
      finalStatus = AI_EVENT_STATUS.DEAD_LETTER;
      set = { status: finalStatus, lastError, deadLetteredAt: finished };
    } else {
      finalStatus = AI_EVENT_STATUS.FAILED;
      set = { status: finalStatus, lastError, nextAttemptAt: new Date(finished.getTime() + computeBackoffMs(event.attempts)) };
    }
  } else {
    finalStatus = AI_EVENT_STATUS.PROCESSED;
    set = { status: finalStatus, processedAt: finished };
  }
  if (durationMs !== undefined) set.lastDurationMs = durationMs;

  // Fenced: only the worker that still owns the lease may record the outcome.
  const res = await AiEvent.updateOne(
    { _id: event._id, status: AI_EVENT_STATUS.PROCESSING, workerId: event.workerId },
    { $set: set, $unset: { leaseUntil: "", workerId: "" } },
  );
  return res.matchedCount === 1 ? finalStatus : AI_EVENT_STATUS.PROCESSING;
}

/**
 * Dispatches one AiEvent (inline attempt from emitEvent, or targeted retry). The event is claimed
 * atomically; if another worker owns it, or it is not yet eligible (backoff), this is a no-op.
 */
export async function dispatchEvent(eventId: string): Promise<void> {
  const claimed = await claimEvent({ workerId: `inline:${process.pid}:${crypto.randomUUID()}`, eventId });
  if (!claimed) return;
  await runClaimedEvent(claimed);
}

export interface SweepResult {
  processed: number;
  deadLettered: number;
  failed: number;
  claimed: number;
  timedOut: boolean;
}

/**
 * Drains eligible events (pending, failed past backoff, crashed-lease) one atomic claim at a time
 * until `limit` events or `timeBudgetMs` is reached. Safe to run concurrently from several workers.
 */
export async function sweepPendingEvents(
  limit = 200,
  timeBudgetMs = 240000,
  opts?: { workerId?: string },
): Promise<SweepResult> {
  await connectDB();
  const workerId = opts?.workerId ?? `sweep:${process.pid}:${crypto.randomUUID()}`;
  const startTime = Date.now();
  const result: SweepResult = { processed: 0, deadLettered: 0, failed: 0, claimed: 0, timedOut: false };

  result.deadLettered += await deadLetterExhausted();

  while (result.claimed < limit) {
    if (Date.now() - startTime > timeBudgetMs) {
      result.timedOut = true;
      console.warn(`[ai-outbox] sweep time budget of ${timeBudgetMs}ms reached after ${result.claimed} events; remaining events stay queued.`);
      break;
    }
    const claimed = await claimEvent({ workerId });
    if (!claimed) break;
    result.claimed += 1;
    let status: AiEventStatus;
    try {
      status = await runClaimedEvent(claimed);
    } catch (err) {
      // An infrastructure error while recording the outcome: leave the lease to expire; it will be reclaimed.
      console.error("[ai-outbox] failed to finalise event; lease will expire and the event be retried", { eventId: String(claimed._id), err: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (status === AI_EVENT_STATUS.PROCESSED) result.processed += 1;
    else if (status === AI_EVENT_STATUS.DEAD_LETTER) result.deadLettered += 1;
    else if (status === AI_EVENT_STATUS.FAILED) result.failed += 1;
  }
  return result;
}

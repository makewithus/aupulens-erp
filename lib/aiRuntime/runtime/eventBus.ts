import connectDB from "@/lib/db";
import AiEvent from "@/models/ai/AiEvent";
import { AI_EVENT_STATUS, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
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

const MAX_ATTEMPTS = 5;

export async function emitEvent(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
  opts?: { dedupeKey?: string },
): Promise<{ eventId: string; deduped: boolean }> {
  await connectDB();

  if (opts?.dedupeKey) {
    const existing = await AiEvent.findOne({ tenantId, eventKey, dedupeKey: opts.dedupeKey });
    if (existing) return { eventId: String(existing._id), deduped: true };
  }

  const event = await AiEvent.create({
    tenantId,
    eventKey,
    payload,
    dedupeKey: opts?.dedupeKey,
    status: AI_EVENT_STATUS.PENDING,
  });

  // Best-effort inline dispatch — never let this throw back to the caller.
  await dispatchEvent(String(event._id)).catch(() => undefined);

  return { eventId: String(event._id), deduped: false };
}

/** Dispatches one AiEvent to every workflow registered for its eventKey.
 *  Used both by emitEvent()'s inline attempt and by the cron sweep's retry. */
export async function dispatchEvent(eventId: string): Promise<void> {
  await connectDB();
  const event = await AiEvent.findById(eventId);
  if (!event) return;
  if (event.status === AI_EVENT_STATUS.PROCESSED) return;

  event.status = AI_EVENT_STATUS.PROCESSING;
  event.attempts += 1;
  await event.save();

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
    const requiresValidation =
      workflow.defaultAutonomy !== AI_AUTONOMY_LEVEL.OBSERVE &&
      workflow.defaultAutonomy !== AI_AUTONOMY_LEVEL.RECOMMEND;
    if (!enabled && requiresValidation) {
      // Above RECOMMEND, a disabled workflow must not run at all — fail closed (Hard Rule 6).
      continue;
    }
    try {
      await runWorkflow(workflow, triggerEvent);
    } catch (err) {
      anyFailed = true;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (anyFailed) {
    event.status = event.attempts >= MAX_ATTEMPTS ? AI_EVENT_STATUS.DEAD_LETTER : AI_EVENT_STATUS.FAILED;
    event.lastError = lastError;
  } else {
    event.status = AI_EVENT_STATUS.PROCESSED;
    event.processedAt = new Date();
  }
  await event.save();
}

/** Drains every pending/failed (under the retry cap) event — called by the
 *  cron sweep route on an hourly schedule. This is the retry-with-backoff +
 *  dead-letter mechanism: "backoff" here is simply "next hourly sweep,"
 *  matching the granularity of every other cron in this codebase. */
export async function sweepPendingEvents(limit = 200): Promise<{ processed: number; deadLettered: number }> {
  await connectDB();
  const events = await AiEvent.find({
    status: { $in: [AI_EVENT_STATUS.PENDING, AI_EVENT_STATUS.FAILED] },
    attempts: { $lt: MAX_ATTEMPTS },
  })
    .limit(limit)
    .lean();

  let processed = 0;
  let deadLettered = 0;

  for (const event of events) {
    await dispatchEvent(String(event._id));
    const after = await AiEvent.findById(event._id).lean();
    if (after?.status === AI_EVENT_STATUS.PROCESSED) processed += 1;
    if (after?.status === AI_EVENT_STATUS.DEAD_LETTER) deadLettered += 1;
  }

  return { processed, deadLettered };
}

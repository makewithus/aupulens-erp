import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import AiSchedule, { AI_SCHEDULE_STATUS } from "@/models/ai/AiSchedule";
import { bootstrapAiRuntime } from "@/lib/aiRuntime/bootstrap";
import { emitEvent, sweepPendingEvents } from "@/lib/aiRuntime/runtime/eventBus";
import { reconcileMissingCreationEvents } from "@/lib/aiRuntime/runtime/reconcile";
import { checkOutboxHealth } from "@/lib/aiRuntime/runtime/outboxHealth";

/**
 * The single implementation of the AI runtime sweep. Both the scheduler registry job
 * (`ai-runtime-sweep`) and the direct cron route call this, so there is exactly one processing
 * path. All emitted events are dedupe-keyed, so running it every scheduler tick is idempotent.
 *
 * Batch size / time budget are env-tunable: AI_SWEEP_LIMIT (default 200), AI_SWEEP_BUDGET_MS
 * (default 45000). They are NOT derived from load testing; record `avgProcessingMsLastHour` from
 * computeOutboxMetrics() in staging before raising them.
 */
export async function runAiRuntimeSweep(opts?: { limit?: number; budgetMs?: number }) {
  bootstrapAiRuntime();
  const limit = opts?.limit ?? (Number(process.env.AI_SWEEP_LIMIT) || 200);
  const budgetMs = opts?.budgetMs ?? (Number(process.env.AI_SWEEP_BUDGET_MS) || 45_000);
  const startedAt = Date.now();

  // 1. emit time-based triggers (cheap, deduped) so their events are drained in this same pass
  await connectDB();
  const orgs = await Organization.find({ isActive: true }, "subdomain").lean();
  const now = new Date();
  const hourKey = now.toISOString().substring(0, 13); // e.g. "2026-09-14T13"
  for (const org of orgs) {
    await emitEvent((org as { subdomain: string }).subdomain, "ai.sweep.hourly", {}, { dedupeKey: hourKey, dispatchInline: false });
  }
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentPeriodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)).toISOString();
  for (const org of orgs) {
    await emitEvent(
      (org as { subdomain: string }).subdomain,
      "period.horizon.reached",
      { period: currentPeriod, periodEnd: currentPeriodEnd },
      { dedupeKey: hourKey, dispatchInline: false },
    );
  }
  const dueSchedules = await AiSchedule.find({ status: AI_SCHEDULE_STATUS.APPROVED, nextRunDate: { $lte: new Date() } })
    .select("_id tenantId nextRunDate")
    .lean();
  for (const schedule of dueSchedules) {
    // dedupeKey = schedule + due date: re-running the sweep before the workflow advances nextRunDate must not pile up duplicates
    await emitEvent(
      schedule.tenantId,
      "schedule.due",
      { scheduleId: String(schedule._id) },
      { dedupeKey: `${schedule._id}:${new Date(schedule.nextRunDate as any).toISOString()}`, dispatchInline: false },
    );
  }

  // 1b. recover creation events lost between a committed business write and its outbox insert
  let reconciled: { recovered: number } | null = null;
  let reconcileError: string | null = null;
  try {
    reconciled = await reconcileMissingCreationEvents(orgs.map((o) => (o as { subdomain: string }).subdomain));
  } catch (err) {
    reconcileError = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ level: "error", msg: "ai-outbox: reconciliation failed", error: reconcileError }));
  }

  // 2. drain the outbox with the remaining budget
  const remaining = Math.max(1_000, budgetMs - (Date.now() - startedAt));
  const sweep = await sweepPendingEvents(limit, remaining);

  // 3. queue health + alerts
  const health = await checkOutboxHealth();

  return {
    ...sweep,
    tenantsSwept: orgs.length,
    reconciledEvents: reconciled?.recovered ?? 0,
    reconcileError,
    schedulesDue: dueSchedules.length,
    backlog: health ? health.pending + health.failedAwaitingRetry : null,
    oldestPendingAgeMs: health?.oldestPendingAgeMs ?? null,
    durationMs: Date.now() - startedAt,
  };
}

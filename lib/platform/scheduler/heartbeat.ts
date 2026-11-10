import connectDB from "@/lib/db";
import SchedulerTriggerHeartbeat from "@/models/platform/SchedulerTriggerHeartbeat";
import PlatformAlert from "@/models/platform/PlatformAlert";
import { emitPlatformAlert } from "@/lib/platform/alerts/emit";
import { resolveAlertsForKey } from "@/lib/platform/alerts/conditions";
import { PLATFORM_ALERT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";

/** The GitHub workflow fires every 15 min; one missed run is jitter, three is an outage. */
export const TRIGGER_EXPECTED_INTERVAL_MS = 15 * 60_000;
export const TRIGGER_STALE_AFTER_MS = 3 * TRIGGER_EXPECTED_INTERVAL_MS;
const ALERT_KEY = "scheduler-trigger-gap";

/** Called at the start of every authenticated run-due call. Raises a gap alert if the previous trigger was too long ago, resolves it otherwise. */
export async function recordTriggerStart(now = new Date()): Promise<{ gapMs: number | null }> {
  await connectDB();
  const prev = await SchedulerTriggerHeartbeat.findOneAndUpdate(
    { singleton: true },
    { $set: { lastTriggerAt: now } },
    { upsert: true, new: false },
  ).lean();
  const gapMs = prev?.lastTriggerAt ? now.getTime() - prev.lastTriggerAt.getTime() : null;
  if (gapMs !== null) await SchedulerTriggerHeartbeat.updateOne({ singleton: true }, { $set: { lastGapMs: gapMs } });
  if (gapMs !== null && gapMs > TRIGGER_STALE_AFTER_MS) {
    const exists = await PlatformAlert.findOne({ alertType: PLATFORM_ALERT_TYPE.SCHEDULER_TRIGGER_STALE, resolvedAt: { $exists: false }, "metadata.dedupeKey": ALERT_KEY }).lean();
    if (!exists) {
      await emitPlatformAlert({
        alertType: PLATFORM_ALERT_TYPE.SCHEDULER_TRIGGER_STALE,
        severity: PLATFORM_SEVERITY.ERROR,
        message: `The external scheduler trigger was silent for ${Math.round(gapMs / 60000)} min (expected every ${TRIGGER_EXPECTED_INTERVAL_MS / 60000} min). Scheduled work did not run during the gap.`,
        metadata: { dedupeKey: ALERT_KEY, gapMs },
      });
    }
  } else if (gapMs !== null) {
    await resolveAlertsForKey(PLATFORM_ALERT_TYPE.SCHEDULER_TRIGGER_STALE, ALERT_KEY);
  }
  return { gapMs };
}

export async function recordTriggerResult(ok: boolean, error?: string, now = new Date()): Promise<void> {
  await connectDB();
  await SchedulerTriggerHeartbeat.updateOne(
    { singleton: true },
    ok
      ? { $set: { lastSuccessAt: now, consecutiveFailures: 0 }, $unset: { lastError: "" } }
      : { $set: { lastFailureAt: now, lastError: error }, $inc: { consecutiveFailures: 1 } },
    { upsert: true },
  );
}

export interface TriggerHealth {
  healthy: boolean;
  reason: "ok" | "never_triggered" | "trigger_stale" | "consecutive_failures";
  lastTriggerAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  ageMs: number | null;
}

export async function getTriggerHealth(now = new Date()): Promise<TriggerHealth> {
  await connectDB();
  const hb = await SchedulerTriggerHeartbeat.findOne({ singleton: true }).lean();
  const ageMs = hb?.lastTriggerAt ? now.getTime() - hb.lastTriggerAt.getTime() : null;
  const failures = hb?.consecutiveFailures ?? 0;
  const reason: TriggerHealth["reason"] = !hb?.lastTriggerAt ? "never_triggered" : ageMs! > TRIGGER_STALE_AFTER_MS ? "trigger_stale" : failures >= 3 ? "consecutive_failures" : "ok";
  return {
    healthy: reason === "ok",
    reason,
    lastTriggerAt: hb?.lastTriggerAt?.toISOString() ?? null,
    lastSuccessAt: hb?.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: hb?.lastFailureAt?.toISOString() ?? null,
    lastError: hb?.lastError ?? null,
    consecutiveFailures: failures,
    ageMs,
  };
}

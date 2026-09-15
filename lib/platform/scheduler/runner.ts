import connectDB from "@/lib/db";
import SchedulerJobRun from "@/models/platform/SchedulerJobRun";
import SchedulerJobLock from "@/models/platform/SchedulerJobLock";
import PlatformAlert from "@/models/platform/PlatformAlert";
import { emitPlatformAlert } from "@/lib/platform/alerts/emit";
import { checkSystemErrorSpike } from "@/lib/platform/alerts/conditions";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";
import {
  PLATFORM_ALERT_TYPE,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { JOB_REGISTRY, JobDefinition, getJobDefinition } from "./registry";

// A stuck lock (a run that crashed instead of releasing it) self-clears
// after this long, so a dead process can never wedge a job forever — the
// same "correctness must not depend on cleanup" principle as
// getActiveAccessGrant()'s live expiry check. Generous: the slowest real
// job here (a per-tenant loop) should never legitimately run this long.
const LOCK_TTL_MS = 15 * 60 * 1000;

// A job overdue by more than this multiple of its own interval raises a
// PlatformAlert (Part 0.3 item 5) — "had this existed, the six days would
// have been six minutes."
const OVERDUE_ALERT_MULTIPLIER = 3;

export interface JobStatus {
  jobId: string;
  description: string;
  owner: string;
  scheduleLabel: string;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  lastRunDurationMs: number | null;
  lastError: string | null;
  lastRunTrigger: string | null;
  nextDueAt: string;
  isDue: boolean;
  isStale: boolean; // overdue past OVERDUE_ALERT_MULTIPLIER × its interval
}

function computeNextDueAt(job: JobDefinition, lastRunAt?: Date): Date {
  if (!lastRunAt) return new Date(0); // never run — immediately due
  return new Date(lastRunAt.getTime() + job.intervalMinutes * 60 * 1000);
}

export async function getJobStatuses(): Promise<JobStatus[]> {
  await connectDB();
  const runs = await SchedulerJobRun.find({}).lean();
  const runByJobId = new Map(runs.map((r) => [r.jobId, r]));
  const now = Date.now();

  return JOB_REGISTRY.map((job) => {
    const run = runByJobId.get(job.jobId);
    const lastRunAt = run?.lastRunAt;
    const nextDueAt = computeNextDueAt(job, lastRunAt);
    const overdueThresholdMs = job.intervalMinutes * 60 * 1000 * OVERDUE_ALERT_MULTIPLIER;
    return {
      jobId: job.jobId,
      description: job.description,
      owner: job.owner,
      scheduleLabel: job.scheduleLabel,
      intervalMinutes: job.intervalMinutes,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      lastRunStatus: run?.lastRunStatus ?? null,
      lastRunDurationMs: run?.lastRunDurationMs ?? null,
      lastError: run?.lastError ?? null,
      lastRunTrigger: run?.lastRunTrigger ?? null,
      nextDueAt: nextDueAt.toISOString(),
      isDue: nextDueAt.getTime() <= now,
      isStale: now - nextDueAt.getTime() > overdueThresholdMs,
    };
  });
}

async function acquireLock(jobId: string): Promise<boolean> {
  await connectDB();
  try {
    await SchedulerJobLock.create({
      jobId,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + LOCK_TTL_MS),
    });
    return true;
  } catch {
    // Unique-index violation — another runner already holds this job's lock.
    return false;
  }
}

async function releaseLock(jobId: string): Promise<void> {
  await SchedulerJobLock.deleteOne({ jobId });
}

async function hasUnresolvedAlert(alertType: string, dedupeKey: string): Promise<boolean> {
  const existing = await PlatformAlert.findOne({
    alertType,
    resolvedAt: { $exists: false },
    "metadata.dedupeKey": dedupeKey,
  }).lean();
  return Boolean(existing);
}

async function resolveAlert(alertType: string, dedupeKey: string): Promise<void> {
  await PlatformAlert.updateMany(
    { alertType, resolvedAt: { $exists: false }, "metadata.dedupeKey": dedupeKey },
    { $set: { resolvedAt: new Date() } },
  );
}

/**
 * Runs one job if its lock can be acquired. Never throws — a failing job's
 * error is recorded, not propagated, so it can never affect whatever
 * triggered it (Part 0.3's "strict isolation" requirement, and the same
 * defensive shape as lib/platform/audit/emit.ts / lib/platform/alerts/emit.ts).
 */
async function runOneJob(
  job: JobDefinition,
  trigger: "run-due" | "opportunistic" | "manual",
  actorId?: string,
): Promise<{ jobId: string; ran: boolean; status?: "success" | "error"; error?: string }> {
  const locked = await acquireLock(job.jobId);
  if (!locked) return { jobId: job.jobId, ran: false };

  const start = Date.now();
  const failedDedupeKey = `scheduler-failed:${job.jobId}`;
  try {
    const result = await job.handler();
    const durationMs = Date.now() - start;
    await SchedulerJobRun.findOneAndUpdate(
      { jobId: job.jobId },
      {
        $set: {
          lastRunAt: new Date(),
          lastRunStatus: "success",
          lastRunDurationMs: durationMs,
          lastRunResult: result,
          lastRunTrigger: trigger,
          lastRunActorId: actorId,
        },
        $unset: { lastError: "" },
      },
      { upsert: true },
    );
    await resolveAlert(PLATFORM_ALERT_TYPE.SCHEDULER_JOB_FAILED, failedDedupeKey);
    return { jobId: job.jobId, ran: true, status: "success" };
  } catch (err) {
    const durationMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    await SchedulerJobRun.findOneAndUpdate(
      { jobId: job.jobId },
      {
        $set: {
          lastRunAt: new Date(),
          lastRunStatus: "error",
          lastRunDurationMs: durationMs,
          lastError: message,
          lastRunTrigger: trigger,
          lastRunActorId: actorId,
        },
      },
      { upsert: true },
    );
    console.error(`[scheduler] job "${job.jobId}" failed`, err);
    if (!(await hasUnresolvedAlert(PLATFORM_ALERT_TYPE.SCHEDULER_JOB_FAILED, failedDedupeKey))) {
      await emitPlatformAlert({
        alertType: PLATFORM_ALERT_TYPE.SCHEDULER_JOB_FAILED,
        severity: PLATFORM_SEVERITY.ERROR,
        message: `Scheduled job "${job.jobId}" failed: ${message}`,
        metadata: { dedupeKey: failedDedupeKey, jobId: job.jobId, error: message },
      });
    }
    return { jobId: job.jobId, ran: true, status: "error", error: message };
  } finally {
    await releaseLock(job.jobId);
  }
}

/** Part 0.3 item 5: a PlatformAlert when a job is overdue past
 *  OVERDUE_ALERT_MULTIPLIER × its own interval. Deduped like every other
 *  alert condition (lib/platform/alerts/conditions.ts) — one standing
 *  alert per job, auto-resolved once it runs again. */
async function raiseStaleAlerts(): Promise<void> {
  const statuses = await getJobStatuses();
  for (const status of statuses) {
    const dedupeKey = `scheduler-stale:${status.jobId}`;
    if (status.isStale) {
      if (await hasUnresolvedAlert(PLATFORM_ALERT_TYPE.SCHEDULER_JOB_STALE, dedupeKey)) continue;
      await emitPlatformAlert({
        alertType: PLATFORM_ALERT_TYPE.SCHEDULER_JOB_STALE,
        severity: PLATFORM_SEVERITY.WARNING,
        message: `Scheduled job "${status.jobId}" is overdue — last ran ${status.lastRunAt ?? "never"}, expected every ${status.scheduleLabel}.`,
        metadata: { dedupeKey, jobId: status.jobId, lastRunAt: status.lastRunAt },
      });
    } else {
      await resolveAlert(PLATFORM_ALERT_TYPE.SCHEDULER_JOB_STALE, dedupeKey);
    }
  }
}

/** Called by the authenticated run-due endpoint (external scheduler —
 *  GitHub Actions, an uptime pinger, an ops machine) and by the
 *  opportunistic in-process checker. Runs every job currently due; skips
 *  (does not error) any job whose lock is already held by a concurrent
 *  caller. */
export async function runDueJobs(
  trigger: "run-due" | "opportunistic" = "run-due",
): Promise<{ ran: string[]; skipped: string[]; failed: string[] }> {
  const statuses = await getJobStatuses();
  const due = statuses.filter((s) => s.isDue);

  const ran: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  const startTime = Date.now();
  const GLOBAL_TIME_BUDGET_MS = 240000; // 4 minutes

  for (const status of due) {
    if (Date.now() - startTime > GLOBAL_TIME_BUDGET_MS) {
      console.warn(`[scheduler] Global time budget of 4m reached. Breaking out to prevent serverless timeout. Remaining jobs will be picked up next tick.`);
      break;
    }

    const job = getJobDefinition(status.jobId);
    if (!job) continue;
    const outcome = await runOneJob(job, trigger);
    if (!outcome.ran) {
      skipped.push(status.jobId);
    } else if (outcome.status === "error") {
      failed.push(status.jobId);
    } else {
      ran.push(status.jobId);
    }
  }

  await raiseStaleAlerts();
  await checkSystemErrorSpike().catch(() => undefined); // never let an alert check fail the scheduler run itself

  return { ran, skipped, failed };
}

/** Manual "Run now" — capability-gated and audited by the route calling
 *  this (matches every other privileged-action pattern in this codebase:
 *  the lib function does the work, the route does auth + this function does
 *  the audit write since it's the one function every trigger path shares).
 *  Runs even if not yet due. */
export async function runJobNow(
  jobId: string,
  actor: AdminActor,
): Promise<{ ran: boolean; status?: "success" | "error"; error?: string }> {
  const job = getJobDefinition(jobId);
  if (!job) throw new Error(`Unknown job "${jobId}".`);
  const outcome = await runOneJob(job, "manual", actor.id);

  await emitPlatformAuditEvent({
    actor,
    eventCategory: PLATFORM_EVENT_CATEGORY.PLATFORM,
    eventType: PLATFORM_EVENT_TYPE.SCHEDULER_JOB_RUN_MANUAL,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "SchedulerJob",
    entityId: jobId,
    metadata: { outcome: outcome.status, error: outcome.error },
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
  });

  return outcome;
}

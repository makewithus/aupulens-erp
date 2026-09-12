import connectDB from "@/lib/db";
import SchedulerJobRun from "@/models/platform/SchedulerJobRun";

/**
 * Phase 10 Part 0.4: the AI usage rollup job (`platform-ai-usage-rollup`,
 * `lib/platform/scheduler/registry.ts`) is a daily job. Vercel Cron no
 * longer runs it (docs/admin/CRON_INCIDENT.md) — it now depends on the
 * scheduler's run-due endpoint or opportunistic runner actually being
 * triggered. If that stops happening for a couple of days, the rollup
 * tables silently stop advancing while dashboards keep reading them as if
 * current — the exact "confidently wrong number" failure mode this project
 * has been checking for everywhere else. A rollup untouched for more than
 * this many hours is treated as stale, and dashboard reads fall back to
 * computing live from AiUsageRecord instead, saying so explicitly.
 */
const STALE_AFTER_HOURS = 26; // a bit over one day — the job's own interval

export async function isAiUsageRollupStale(): Promise<boolean> {
  await connectDB();
  const run = await SchedulerJobRun.findOne({ jobId: "platform-ai-usage-rollup" }).lean();
  if (!run?.lastRunAt) return true; // never run — treat as stale, not as "no data"
  const ageMs = Date.now() - new Date(run.lastRunAt).getTime();
  return ageMs > STALE_AFTER_HOURS * 60 * 60 * 1000;
}

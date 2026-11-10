import { NextRequest, NextResponse, after } from "next/server";
import { runDueJobs } from "@/lib/platform/scheduler/runner";
import { recordTriggerResult, recordTriggerStart } from "@/lib/platform/scheduler/heartbeat";

/**
 * Phase 10 Part 0.3 item 2 — the integration point for any external
 * scheduler now that this project's Vercel plan no longer supports the
 * cron schedules it had (docs/admin/CRON_INCIDENT.md). Same CRON_SECRET
 * bearer-check shape as every existing app/api/cron/** route. A free
 * GitHub Actions scheduled workflow (.github/workflows/scheduled-jobs.yml)
 * calls this on a timer; an uptime pinger or an ops machine works equally
 * well — this is deliberately just an authenticated HTTP endpoint, not
 * tied to any one triggering mechanism.
 */
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // Heartbeat first: it is what lets a monitor (and the gap alert) see that the external trigger is alive.
  await recordTriggerStart().catch((err) => console.error("[scheduler] heartbeat start failed", err));

  after(async () => {
    try {
      const outcome = await runDueJobs("run-due");
      const failed = outcome?.failed ?? [];
      await recordTriggerResult(failed.length === 0, failed.length ? `jobs failed: ${failed.join(", ")}` : undefined);
    } catch (err) {
      console.error("[scheduler] run-due failed", err);
      await recordTriggerResult(false, err instanceof Error ? err.message : String(err)).catch(() => {});
    }
  });

  return NextResponse.json({ success: true, message: "Scheduler jobs dispatched to background" });
}

export { handler as GET, handler as POST };

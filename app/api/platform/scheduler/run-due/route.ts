import { NextRequest, NextResponse } from "next/server";
import { runDueJobs } from "@/lib/platform/scheduler/runner";

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

  const result = await runDueJobs("run-due");
  return NextResponse.json({ success: true, ...result });
}

export { handler as GET, handler as POST };

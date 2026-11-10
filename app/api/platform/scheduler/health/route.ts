import { NextRequest, NextResponse } from "next/server";
import { getTriggerHealth } from "@/lib/platform/scheduler/heartbeat";

/**
 * Health of the external scheduler trigger, for an uptime monitor (second, independent observer).
 * 200 = triggered recently and not failing; 503 = never triggered / silent too long / failing.
 * Same CRON_SECRET bearer check as /run-due. Read-only: it never executes jobs, so a monitor
 * polling it cannot cause duplicate execution.
 */
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const health = await getTriggerHealth();
  return NextResponse.json({ success: health.healthy, ...health }, { status: health.healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
export { handler as GET };

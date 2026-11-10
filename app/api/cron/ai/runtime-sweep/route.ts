import { NextRequest, NextResponse } from "next/server";
import { runAiRuntimeSweep } from "@/lib/aiRuntime/runtime/sweepJob";

// Thin wrapper over the shared runAiRuntimeSweep() (the scheduler registry job calls the same function).
// Same CRON_SECRET bearer-check shape as every other cron route (see
// app/api/cron/business-health/route.ts). Scheduled hourly via vercel.json.
// This is the AI runtime's retry-with-backoff + dead-letter mechanism (Hard
// Rule 6, Part 2.5): emitEvent() already attempts inline dispatch in the
// same request it's called from; anything left pending/failed after that
// (the workflow threw, or a serverless invocation timed out mid-dispatch)
// gets retried here, up to eventBus.ts's MAX_ATTEMPTS cap, then dead-lettered.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const result = await runAiRuntimeSweep();
  return NextResponse.json({ success: true, ...result });
}

export { handler as GET, handler as POST };

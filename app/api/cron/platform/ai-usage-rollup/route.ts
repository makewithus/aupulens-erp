import { NextRequest, NextResponse } from "next/server";
import { rollupAiUsageForDay } from "@/lib/platform/ai/rollup";

// Same CRON_SECRET bearer-check shape as every other cron route (e.g.
// app/api/cron/business-health/route.ts). Scheduled via vercel.json.
// Rolls up yesterday's (UTC) AiUsageRecord + AiWorkflowRun documents into
// AiUsageDaily/AiUsageMonthly — idempotent, safe to re-run.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await rollupAiUsageForDay(yesterday);

  return NextResponse.json({ success: true, ...result });
}

export { handler as GET, handler as POST };

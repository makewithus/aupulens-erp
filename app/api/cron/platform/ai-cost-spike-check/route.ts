import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { checkAiCostSpike } from "@/lib/platform/alerts/conditions";

// Same CRON_SECRET bearer-check shape as every other cron route (source doc
// §28, Phase 9 Addendum C Part 3). Daily — a spike is a day-over-trailing-
// average comparison, not something that needs per-request checking.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  await checkAiCostSpike();

  return NextResponse.json({ success: true });
}

export { handler as GET, handler as POST };

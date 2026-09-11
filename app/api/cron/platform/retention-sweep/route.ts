import { NextRequest, NextResponse } from "next/server";
import { runRetentionSweep } from "@/lib/platform/audit/retention";

// Same CRON_SECRET bearer-check shape as every other cron route.
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const result = await runRetentionSweep();
  return NextResponse.json({ success: true, ...result });
}

export { handler as GET, handler as POST };

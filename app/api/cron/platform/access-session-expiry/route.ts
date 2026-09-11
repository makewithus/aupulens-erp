import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import AdminAccessRequest from "@/models/platform/AdminAccessRequest";
import { ADMIN_ACCESS_REQUEST_STATUS } from "@/lib/constants/statuses";

// Same CRON_SECRET bearer-check shape as every other cron route. Tidies the
// stored `status` field for reporting only — the real enforcement boundary
// is the live expiresAt check in lib/platform/access/status.ts, not this job.
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
  const result = await AdminAccessRequest.updateMany(
    { status: ADMIN_ACCESS_REQUEST_STATUS.APPROVED, expiresAt: { $lt: new Date() } },
    { $set: { status: ADMIN_ACCESS_REQUEST_STATUS.EXPIRED } },
  );

  return NextResponse.json({ success: true, expired: result.modifiedCount });
}

export { handler as GET, handler as POST };

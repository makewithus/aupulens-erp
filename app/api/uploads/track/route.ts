import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StorageUsage from "@/models/platform/StorageUsage";

/**
 * Phase 12 Part 0.2 — Storage Used instrumentation. Called fire-and-forget
 * from `lib/upload.ts::uploadToCloudinary()` immediately after a real
 * upload succeeds. `tenantId` is never trusted from the client — always the
 * server session's own, so a tenant can only ever increment its own counter.
 * Never allowed to affect the upload itself: this route runs strictly after
 * the real Cloudinary upload has already succeeded and its URL already
 * returned to the caller; a failure here has no way to reach the uploader.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const bytes = Number(body?.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return NextResponse.json({ success: false, message: "bytes must be a positive number." }, { status: 400 });
  }

  await connectDB();
  await StorageUsage.findOneAndUpdate(
    { tenantId: session.user.tenantId },
    { $inc: { totalBytes: bytes, fileCount: 1 }, $set: { lastUploadAt: new Date() } },
    { upsert: true },
  );

  return NextResponse.json({ success: true });
}

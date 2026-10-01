import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { startWorkerDaemon } from "@/lib/migration/worker";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });

  if (batch.status !== "preview") {
    return NextResponse.json(
      { success: false, message: "Wait for validation and preview review to finish before starting migration." },
      { status: 400 },
    );
  }

  const [unresolvedDuplicates, invalidRecords, pendingRecords] = await Promise.all([
    MigrationRecord.countDocuments({
      batchId: batch._id,
      tenantId: session.user.tenantId,
      status: "duplicate",
      duplicateAction: { $exists: false },
    }),
    MigrationRecord.countDocuments({
      batchId: batch._id,
      tenantId: session.user.tenantId,
      status: "invalid",
    }),
    MigrationRecord.countDocuments({
      batchId: batch._id,
      tenantId: session.user.tenantId,
      status: "pending",
    }),
  ]);
  if (pendingRecords > 0) {
    return NextResponse.json(
      { success: false, message: "Validation is still running. Please wait for preview to finish." },
      { status: 400 },
    );
  }
  if (invalidRecords > 0) {
    return NextResponse.json(
      { success: false, message: "Fix invalid records before starting migration." },
      { status: 400 },
    );
  }
  if (unresolvedDuplicates > 0) {
    return NextResponse.json(
      { success: false, message: "Resolve duplicate records before starting migration." },
      { status: 400 },
    );
  }

  batch.status = "running";
  batch.progress = 0; // reset for migration phase
  await batch.save();

  await startWorkerDaemon(id, req.nextUrl.origin);

  return NextResponse.json({ success: true, data: batch });
}

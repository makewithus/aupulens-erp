import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { getHandler } from "@/lib/migration/importer";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });
  if (!["completed", "failed"].includes(batch.status)) {
    return NextResponse.json({ success: false, message: "Only failed or completed-with-failures batches can be reopened." }, { status: 400 });
  }

  const failedRecords = await MigrationRecord.find({ batchId: id, tenantId: session.user.tenantId, status: "failed" });
  let retryCount = 0;
  let invalidCount = 0;

  for (const record of failedRecords) {
    const handler = getHandler(record.entityType);
    const conflict = handler?.uniqueConflictFilter?.((record.mappedData || {}) as Record<string, string>, session.user.tenantId);
    const existing = handler && conflict
      ? await handler.model.findOne(conflict.filter).select("_id").lean()
      : null;

    if (existing && conflict) {
      record.status = "valid";
      record.duplicateReason = undefined;
      record.duplicateFields = [];
      record.duplicateTargetId = undefined;
      record.duplicateAction = undefined;
      record.errors = [] as any;
      retryCount += 1;
    } else {
      record.status = "invalid";
      record.duplicateAction = undefined;
      record.duplicateTargetId = undefined;
      record.duplicateReason = undefined;
      record.duplicateFields = [];
      invalidCount += 1;
    }
    await record.save();
  }

  const [{ valid, invalid, duplicate }, migrated] = await Promise.all([
    computeMigrationReviewSummary(batch._id, session.user.tenantId),
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: session.user.tenantId, status: "migrated" }),
  ]);

  batch.status = "preview";
  batch.progress = 100;
  batch.summary = { ...batch.summary, valid, invalid, duplicate, migrated, failed: 0 };
  batch.workerLock = null;
  batch.workerHeartbeat = null;
  await batch.save();

  return NextResponse.json({
    success: true,
    message: `Reopened ${failedRecords.length} failed record${failedRecords.length === 1 ? "" : "s"}. ${retryCount} can be retried safely as updates.`,
    data: { retryCount, invalidCount },
  });
}

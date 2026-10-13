import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { friendlyMigrationRecordError, summarizeMigrationRow } from "@/lib/migration/friendlyRecordError";
import { buildMigrationProgress } from "@/lib/migration/progress";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";
import { moveDuplicateWriteErrorsToReview } from "@/lib/migration/duplicateReview";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json({ success: false, message: "Invalid migration batch link." }, { status: 400 });
  }

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!batch) {
    return NextResponse.json({ success: false, message: "Migration batch not found. It may have been deleted or belongs to another workspace." }, { status: 404 });
  }
  await moveDuplicateWriteErrorsToReview(id, session.user.tenantId);

  const jobs = await MigrationJob.find({ batchId: id, tenantId: session.user.tenantId }).select("-rows").lean();
  const progress = await buildMigrationProgress(batch, jobs);
  const [reviewSummary, migratedRows, skippedRows, failedRows] = await Promise.all([
    computeMigrationReviewSummary(batch._id, session.user.tenantId),
    MigrationRecord.countDocuments({ batchId: id, tenantId: session.user.tenantId, status: "migrated" }),
    MigrationRecord.countDocuments({ batchId: id, tenantId: session.user.tenantId, status: "skipped" }),
    MigrationRecord.countDocuments({ batchId: id, tenantId: session.user.tenantId, status: "failed" }),
  ]);
  const liveBatch = {
    ...batch,
    summary: {
      ...(batch.summary || {}),
      ...reviewSummary,
      migrated: migratedRows + skippedRows,
      failed: failedRows,
    },
  };
  const failedRecordsRaw = failedRows > 0
    ? await MigrationRecord.find({ batchId: id, tenantId: session.user.tenantId, status: "failed" })
        .select("entityType sourceData mappedData errors")
        .limit(20)
        .lean()
    : [];
  const failedRecords = failedRecordsRaw.map((record) => ({
    ...record,
    friendlyError: friendlyMigrationRecordError(record),
    rowSummary: summarizeMigrationRow(record),
  }));

  return NextResponse.json({ success: true, data: { batch: liveBatch, jobs, failedRecords, progress } });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { friendlyMigrationRecordError, summarizeMigrationRow } from "@/lib/migration/friendlyRecordError";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });

  const jobs = await MigrationJob.find({ batchId: id, tenantId: session.user.tenantId }).select("-rows").lean();
  const failedRecordsRaw = (batch.summary?.failed || 0) > 0
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

  return NextResponse.json({ success: true, data: { batch, jobs, failedRecords } });
}

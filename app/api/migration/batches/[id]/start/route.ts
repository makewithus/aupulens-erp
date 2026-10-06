import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { startWorkerDaemon } from "@/lib/migration/worker";
import { getHandler } from "@/lib/migration/importer";

async function runPreMigrationConflictCheck(batch: any, tenantId: string) {
  const records = await MigrationRecord.find({
    batchId: batch._id,
    tenantId,
    status: "valid",
  });

  let conflicts = 0;
  for (const record of records) {
    const handler = getHandler(record.entityType);
    const conflict = handler?.uniqueConflictFilter?.((record.mappedData || {}) as Record<string, string>, tenantId);
    if (!handler || !conflict) continue;

    const existing = await handler.model.findOne(conflict.filter).select("_id").lean();
    if (!existing) continue;

    conflicts += 1;
    await MigrationRecord.updateOne(
      { _id: record._id, tenantId },
      {
        $set: {
          status: "duplicate",
          duplicateReason: "database",
          duplicateFields: conflict.fields,
          duplicateTargetId: (existing as any)._id,
          errors: [{
            message: `Existing workspace record uses unique field ${conflict.fields.join(", ")}. Choose Merge / Update or Skip before migration.`,
          }],
        },
        $unset: { duplicateAction: "" },
      },
    );
  }

  if (conflicts > 0) {
    const [valid, invalid, duplicate] = await Promise.all([
      MigrationRecord.countDocuments({ batchId: batch._id, tenantId, status: "valid" }),
      MigrationRecord.countDocuments({ batchId: batch._id, tenantId, status: "invalid" }),
      MigrationRecord.countDocuments({ batchId: batch._id, tenantId, status: "duplicate" }),
    ]);
    batch.summary = { ...batch.summary, valid, invalid, duplicate };
    await batch.save();
  }

  return conflicts;
}

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

  const pendingRecords = await MigrationRecord.countDocuments({
    batchId: batch._id,
    tenantId: session.user.tenantId,
    status: "pending",
  });
  if (pendingRecords > 0) {
    return NextResponse.json(
      { success: false, message: "Validation is still running. Please wait for preview to finish." },
      { status: 400 },
    );
  }

  const preMigrationConflicts = await runPreMigrationConflictCheck(batch, session.user.tenantId);

  const [unresolvedDuplicates, invalidRecords] = await Promise.all([
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
  ]);
  if (invalidRecords > 0) {
    return NextResponse.json(
      { success: false, message: "Fix invalid records before starting migration." },
      { status: 400 },
    );
  }
  if (unresolvedDuplicates > 0) {
    return NextResponse.json(
      {
        success: false,
        message: preMigrationConflicts > 0
          ? `Found ${preMigrationConflicts} live database conflict${preMigrationConflicts === 1 ? "" : "s"}. Resolve the highlighted duplicate records before starting migration.`
          : "Resolve duplicate records before starting migration.",
      },
      { status: 400 },
    );
  }

  batch.status = "running";
  batch.progress = 0; // reset for migration phase
  await batch.save();

  await startWorkerDaemon(id, req.nextUrl.origin);

  return NextResponse.json({ success: true, data: batch });
}

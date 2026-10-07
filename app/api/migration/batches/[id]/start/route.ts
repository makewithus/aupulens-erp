import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { startWorkerDaemon } from "@/lib/migration/worker";
import { getHandler } from "@/lib/migration/importer";
import { resolveEntityReference } from "@/lib/migration/resolver";
import { productionMigrationError } from "@/lib/migration/errors";

async function runPreMigrationConflictCheck(batch: any, tenantId: string) {
  const records = await MigrationRecord.find({
    batchId: batch._id,
    tenantId,
    status: "duplicate",
    duplicateAction: "update",
  });

  let conflicts = 0;
  for (const record of records) {
    const handler = getHandler(record.entityType);
    const conflict = handler?.uniqueConflictFilter?.((record.mappedData || {}) as Record<string, string>, tenantId);
    if (!handler || !conflict) continue;

    const filter = record.duplicateAction === "update" && record.duplicateTargetId
      ? { ...conflict.filter, _id: { $ne: record.duplicateTargetId } }
      : conflict.filter;
    const existing = await handler.model.findOne(filter).select("_id").lean();
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
            message: `Merge / Update would conflict with another existing record using ${conflict.fields.join(", ")}. Choose Force Create or Skip before migration.`,
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
      MigrationRecord.countDocuments({ batchId: batch._id, tenantId, status: "duplicate", duplicateAction: { $exists: false } }),
    ]);
    batch.summary = { ...batch.summary, valid, invalid, duplicate };
    await batch.save();
  }

  return conflicts;
}

async function runWriteReadinessCheck(batch: any, tenantId: string) {
  const records = await MigrationRecord.find({
    batchId: batch._id,
    tenantId,
    $or: [
      { status: "valid" },
      { status: "duplicate", duplicateAction: { $in: ["update", "create"] } },
    ],
  });

  let invalid = 0;
  for (const record of records) {
    const handler = getHandler(record.entityType);
    if (!handler || handler.createOperation) continue;

    try {
      const transformed = await handler.transform((record.mappedData || {}) as Record<string, string>, {
        tenantId,
        userId: batch.createdBy.toString(),
        resolveRef: (entityType: string, sourceId: string) => resolveEntityReference(tenantId, batch._id.toString(), entityType, sourceId),
      });
      const doc = new handler.model(transformed);
      const validationError = doc.validateSync();
      if (validationError) throw validationError;
    } catch (error) {
      invalid += 1;
      const message = productionMigrationError(error);
      await MigrationRecord.updateOne(
        { _id: record._id, tenantId },
        {
          $set: {
            status: "invalid",
            errors: [{ message: `Pre-migration write check failed: ${message}` }],
          },
          $unset: { duplicateAction: "", duplicateTargetId: "", duplicateReason: "", duplicateFields: "" },
        },
      );
    }
  }

  if (invalid > 0) {
    const [valid, invalidCount, duplicate] = await Promise.all([
      MigrationRecord.countDocuments({ batchId: batch._id, tenantId, status: "valid" }),
      MigrationRecord.countDocuments({ batchId: batch._id, tenantId, status: "invalid" }),
      MigrationRecord.countDocuments({ batchId: batch._id, tenantId, status: "duplicate", duplicateAction: { $exists: false } }),
    ]);
    batch.summary = { ...batch.summary, valid, invalid: invalidCount, duplicate };
    await batch.save();
  }

  return invalid;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });

  try {
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
    const writeReadinessFailures = await runWriteReadinessCheck(batch, session.user.tenantId);

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
        {
          success: false,
          message: writeReadinessFailures > 0
            ? `Found ${writeReadinessFailures} record${writeReadinessFailures === 1 ? "" : "s"} that cannot be written safely. Fix the highlighted invalid records before starting migration.`
            : "Fix invalid records before starting migration.",
        },
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

    await MigrationBatch.updateOne(
      { _id: batch._id, tenantId: session.user.tenantId, status: "preview" },
      { $set: { status: "running", progress: 0 } },
    );

    await startWorkerDaemon(id, req.nextUrl.origin);

    return NextResponse.json({ success: true, data: { ...batch.toObject(), status: "running", progress: 0 } });
  } catch (err) {
    const message = productionMigrationError(err);
    await MigrationBatch.updateOne(
      { _id: batch._id, tenantId: session.user.tenantId },
      { $set: { status: "failed", errors: [{ message }], workerLock: null, workerHeartbeat: null } },
    );
    return NextResponse.json({ success: false, message }, { status: 200 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { getHandler } from "@/lib/migration/importer";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";
import { checkJournalAccountDependencies } from "@/lib/migration/dependencyCheck";

async function refreshDuplicateSummary(batch: any, tenantId: string) {
  const summary = await computeMigrationReviewSummary(batch._id, tenantId);
  batch.summary = { ...batch.summary, ...summary };
  await batch.save();
  return summary.duplicate;
}

async function findUnsafeUpdateConflict(record: any, tenantId: string) {
  if (!record.duplicateTargetId) return null;
  const handler = getHandler(record.entityType);
  const conflict = handler?.uniqueConflictFilter?.((record.mappedData || {}) as Record<string, string>, tenantId);
  if (!handler || !conflict) return null;

  const existing = await handler.model
    .findOne({ ...conflict.filter, _id: { $ne: record.duplicateTargetId } })
    .select("_id")
    .lean();
  return existing ? conflict.fields : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const id = resolvedParams.id;
  
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { recordId, action, scope } = await req.json();
  if (!["skip", "update", "create"].includes(action) || (!recordId && scope !== "all")) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  await dbConnect();
  
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!batch || batch.status !== "preview") {
    return NextResponse.json({ success: false, message: "Batch not in preview state" }, { status: 400 });
  }

  if (scope === "all") {
    const query: Record<string, unknown> = unresolvedDuplicateFilter({
      batchId: id,
      tenantId: session.user.tenantId,
    });
    if (action === "update") {
      const candidates = await MigrationRecord.find({ ...query, duplicateTargetId: { $exists: true } }).select("_id entityType mappedData duplicateTargetId").lean();
      const unsafeIds = [];
      const conflicts = await Promise.all(
        candidates.map(candidate => findUnsafeUpdateConflict(candidate, session.user.tenantId).then(conflict => conflict ? candidate._id : null))
      );
      unsafeIds.push(...conflicts.filter(id => id !== null));
      if (unsafeIds.length > 0) {
        query._id = { $nin: unsafeIds };
      }
    }

    let result;
    if (action === "update") {
      const [databaseResult, uploadResult] = await Promise.all([
        MigrationRecord.updateMany(
          { ...query, duplicateTargetId: { $exists: true } },
          { $set: { duplicateAction: "update", status: "duplicate", errors: [] } },
        ),
        MigrationRecord.updateMany(
          { ...query, duplicateTargetId: { $exists: false } },
          { $set: { duplicateAction: "skip", status: "skipped", errors: [] }, $unset: { targetRecordId: "" } },
        ),
      ]);
      result = { modifiedCount: databaseResult.modifiedCount + uploadResult.modifiedCount };
    } else {
      const update: Record<string, unknown> = { duplicateAction: action };
      if (action === "create") {
        update.status = "duplicate";
        update.errors = [];
      } else if (action === "skip") {
        update.status = "skipped";
        update.errors = [];
      }
      result = await MigrationRecord.updateMany(query, { $set: update });
    }

    if (action === "skip") {
      await MigrationRecord.updateMany(query, { $unset: { targetRecordId: "" } });
    }
    const dependencyCheck = action === "skip"
      ? await checkJournalAccountDependencies(batch._id, session.user.tenantId)
      : null;
    const remainingDuplicates = await refreshDuplicateSummary(batch, session.user.tenantId);
    const successMessage =
      action === "update"
        ? "Duplicates merged successfully."
        : action === "create"
          ? "Duplicates marked to be created separately."
          : "Duplicates skipped successfully.";
    const emptyMessage =
      action === "update"
        ? "No duplicates are available to merge."
        : "No duplicate records need action.";
    return NextResponse.json({
      success: true,
      resolvedCount: result.modifiedCount,
      remainingDuplicates,
      message: result.modifiedCount > 0
        ? (dependencyCheck?.reopenedSkipped
          ? `${dependencyCheck.reopenedSkipped} skipped account record(s) are required by journal entries and have been returned to duplicate review.`
          : successMessage)
        : emptyMessage,
    });
  }

  const record = await MigrationRecord.findOne({ _id: recordId, batchId: id, tenantId: session.user.tenantId });
  if (!record) {
    return NextResponse.json({ success: false, message: "Record not found" }, { status: 404 });
  }
  const resolvedAction = action;
  if (resolvedAction === "update" && record.duplicateTargetId) {
    const conflictFields = await findUnsafeUpdateConflict(record, session.user.tenantId);
    if (conflictFields) {
      return NextResponse.json(
        {
          success: false,
          message: `Merge / Update would conflict with another existing record using ${conflictFields.join(", ")}. Choose Force Create or Skip for this row.`,
        },
        { status: 400 },
      );
    }
  }

  record.duplicateAction = resolvedAction;
  if (resolvedAction === "update" && !record.duplicateTargetId) {
    record.duplicateAction = "skip";
    record.status = "skipped";
    record.errors = [] as any;
    record.targetRecordId = undefined;
  } else if (resolvedAction === "create" || resolvedAction === "update") {
    record.status = "duplicate";
    record.errors = [] as any;
  } else if (resolvedAction === "skip") {
    record.status = "skipped";
    record.errors = [] as any;
    record.targetRecordId = undefined;
  }
  await record.save();
  const dependencyCheck = resolvedAction === "skip"
    ? await checkJournalAccountDependencies(batch._id, session.user.tenantId)
    : null;
  const remainingDuplicates = await refreshDuplicateSummary(batch, session.user.tenantId);

  const message =
    resolvedAction === "update"
      ? "Duplicate merged successfully."
      : resolvedAction === "create"
        ? "Duplicate marked to be created separately."
        : "Duplicate skipped successfully.";
  return NextResponse.json({
    success: true,
    remainingDuplicates,
    message: dependencyCheck?.reopenedSkipped
      ? `${dependencyCheck.reopenedSkipped} skipped account record(s) are required by journal entries and have been returned to duplicate review.`
      : message,
  });
}

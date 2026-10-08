import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { getHandler } from "@/lib/migration/importer";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";

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
      query.duplicateTargetId = { $exists: true };
    }

    if (action === "update") {
      const candidates = await MigrationRecord.find(query).select("_id entityType mappedData duplicateTargetId").lean();
      const unsafeIds = [];
      const conflicts = await Promise.all(
        candidates.map(candidate => findUnsafeUpdateConflict(candidate, session.user.tenantId).then(conflict => conflict ? candidate._id : null))
      );
      unsafeIds.push(...conflicts.filter(id => id !== null));
      if (unsafeIds.length > 0) {
        query._id = { $nin: unsafeIds };
      }
    }

    const update: Record<string, unknown> = { duplicateAction: action };
    if (action === "create" || action === "update") {
      update.errors = [];
    }

    const result = await MigrationRecord.updateMany(query, { $set: update });
    const remainingDuplicates = await refreshDuplicateSummary(batch, session.user.tenantId);
    const actionLabel = action === "create" ? "force create" : action === "update" ? "merge/update" : "skip";
    return NextResponse.json({
      success: true,
      resolvedCount: result.modifiedCount,
      remainingDuplicates,
      message: result.modifiedCount > 0
        ? `Saved ${actionLabel} for ${result.modifiedCount} duplicate record${result.modifiedCount === 1 ? "" : "s"}.`
        : action === "update"
          ? "No database duplicates are available for merge/update."
          : "No unresolved duplicates found.",
    });
  }

  const record = await MigrationRecord.findOne({ _id: recordId, batchId: id, tenantId: session.user.tenantId });
  if (!record) {
    return NextResponse.json({ success: false, message: "Record not found" }, { status: 404 });
  }
  const resolvedAction = action;
  if (resolvedAction === "update" && !record.duplicateTargetId) {
    return NextResponse.json(
      { success: false, message: "This duplicate has no existing workspace record to update. Choose Skip or Force Create." },
      { status: 400 },
    );
  }
  if (resolvedAction === "update") {
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
  if (resolvedAction === "create" || resolvedAction === "update") {
    record.errors = [] as any;
  }
  await record.save();
  const remainingDuplicates = await refreshDuplicateSummary(batch, session.user.tenantId);

  const actionLabel = resolvedAction === "create" ? "force create" : resolvedAction === "update" ? "merge/update" : "skip";
  return NextResponse.json({ success: true, remainingDuplicates, message: `Duplicate resolution saved: ${actionLabel}.` });
}

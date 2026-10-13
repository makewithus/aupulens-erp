import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { getHandler } from "@/lib/migration/importer";
import { migrationErrorsContainDuplicate } from "@/lib/migration/duplicateResolution";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";

export async function moveDuplicateWriteErrorsToReview(batchId: string, tenantId: string) {
  const records = await MigrationRecord.find({
    batchId,
    tenantId,
    status: "invalid",
  });

  let moved = 0;
  for (const record of records) {
    if (!migrationErrorsContainDuplicate(record.errors)) continue;

    const handler = getHandler(record.entityType);
    const conflict = handler?.uniqueConflictFilter?.((record.mappedData || {}) as Record<string, string>, tenantId);
    const existing = handler && conflict
      ? await handler.model.findOne(conflict.filter).select("_id").lean()
      : null;

    record.status = "duplicate";
    record.duplicateReason = existing ? "database" : "upload";
    record.duplicateFields = conflict?.fields || [];
    record.duplicateTargetId = existing ? (existing as any)._id : undefined;
    record.duplicateAction = undefined;
    record.errors = [{
      message: existing
        ? "Duplicate record found in workspace. Choose Merge / Update, Force Create, or Skip."
        : "Duplicate record found in uploaded data. Choose Merge, Force Create, or Skip.",
    }] as any;
    await record.save();
    moved += 1;
  }

  if (moved > 0) {
    const batch = await MigrationBatch.findOne({ _id: batchId, tenantId });
    if (batch) {
      const summary = await computeMigrationReviewSummary(batch._id, tenantId);
      batch.summary = { ...batch.summary, ...summary };
      await batch.save();
    }
  }

  return moved;
}

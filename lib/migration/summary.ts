import MigrationRecord from "@/models/admin/MigrationRecord";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";

export async function computeMigrationReviewSummary(batchId: unknown, tenantId: string) {
  const [valid, invalid, duplicate] = await Promise.all([
    MigrationRecord.countDocuments({
      batchId,
      tenantId,
      $or: [
        { status: "valid" },
        { status: "duplicate", duplicateAction: { $in: ["update", "create"] } },
      ],
    }),
    MigrationRecord.countDocuments({ batchId, tenantId, status: "invalid" }),
    MigrationRecord.countDocuments(unresolvedDuplicateFilter({ batchId, tenantId })),
  ]);

  return { valid, invalid, duplicate };
}

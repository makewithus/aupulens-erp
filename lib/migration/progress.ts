import MigrationRecord from "@/models/admin/MigrationRecord";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";

const ENTITY_ORDER = [
  MIGRATION_ENTITY.CUSTOMER,
  MIGRATION_ENTITY.VENDOR,
  MIGRATION_ENTITY.PRODUCT,
  MIGRATION_ENTITY.SALES_ORDER,
  MIGRATION_ENTITY.SALES_ORDER_LINE,
  MIGRATION_ENTITY.SALES_INVOICE,
  MIGRATION_ENTITY.INVOICE_ITEM,
  MIGRATION_ENTITY.PAYMENT,
  MIGRATION_ENTITY.ACCOUNT,
  MIGRATION_ENTITY.EMPLOYEE,
  MIGRATION_ENTITY.PURCHASE_INVOICE,
  MIGRATION_ENTITY.EXPENSE,
];

const ENTITY_LABELS: Record<string, string> = {
  [MIGRATION_ENTITY.CUSTOMER]: "Customers",
  [MIGRATION_ENTITY.VENDOR]: "Suppliers",
  [MIGRATION_ENTITY.PRODUCT]: "Products",
  [MIGRATION_ENTITY.SALES_ORDER]: "Sales Orders",
  [MIGRATION_ENTITY.SALES_ORDER_LINE]: "Order Lines",
  [MIGRATION_ENTITY.SALES_INVOICE]: "Invoices",
  [MIGRATION_ENTITY.INVOICE_ITEM]: "Invoice Lines",
  [MIGRATION_ENTITY.PAYMENT]: "Payments",
  [MIGRATION_ENTITY.ACCOUNT]: "Accounts",
  [MIGRATION_ENTITY.EMPLOYEE]: "Employees",
  [MIGRATION_ENTITY.PURCHASE_INVOICE]: "Purchase Invoices",
  [MIGRATION_ENTITY.EXPENSE]: "Expenses",
};

function statusCount(counts: Record<string, number>, status: string) {
  return counts[status] || 0;
}

export async function buildMigrationProgress(batch: any, jobs: any[]) {
  const grouped = await MigrationRecord.aggregate([
    { $match: { batchId: batch._id, tenantId: batch.tenantId } },
    { $group: { _id: { entityType: "$entityType", status: "$status" }, count: { $sum: 1 } } },
  ]);

  const countsByEntity = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const entityType = row._id.entityType;
    if (!countsByEntity.has(entityType)) countsByEntity.set(entityType, {});
    countsByEntity.get(entityType)![row._id.status] = row.count;
  }

  const totalsByEntity = new Map<string, number>();
  for (const job of jobs) {
    totalsByEntity.set(job.entityType, (totalsByEntity.get(job.entityType) || 0) + (job.totalRows || 0));
  }

  const entityTypes = [...new Set([
    ...ENTITY_ORDER,
    ...jobs.map((job) => job.entityType),
  ])].filter((entityType) => totalsByEntity.has(entityType));

  const isRunning = batch.status === "running" || batch.status === "verifying";
  const rows = entityTypes.map((entityType) => {
    const counts = countsByEntity.get(entityType) || {};
    const total = totalsByEntity.get(entityType) || Object.values(counts).reduce((sum, count) => sum + count, 0);
    const processed = isRunning
      ? statusCount(counts, "migrated") + statusCount(counts, "skipped") + statusCount(counts, "failed")
      : Math.max(0, total - statusCount(counts, "pending"));

    return {
      entityType,
      label: ENTITY_LABELS[entityType] || entityType,
      total,
      processed: Math.min(processed, total),
      statusCounts: counts,
    };
  });

  const current = rows.find((row) => row.processed < row.total) || rows[rows.length - 1] || null;
  const [errors, duplicates] = await Promise.all([
    MigrationRecord.countDocuments({
      batchId: batch._id,
      tenantId: batch.tenantId,
      status: { $in: ["invalid", "failed"] },
    }),
    MigrationRecord.countDocuments(unresolvedDuplicateFilter({
      batchId: batch._id,
      tenantId: batch.tenantId,
    })),
  ]);

  return {
    mode: isRunning ? "migration" : "validation",
    rows,
    currentStep: current
      ? `${isRunning ? "Importing" : "Checking"} ${current.label}`
      : isRunning ? "Finalizing migration" : "Finalizing validation",
    recordsProcessed: rows.reduce((sum, row) => sum + row.processed, 0),
    totalRecords: rows.reduce((sum, row) => sum + row.total, 0),
    errors,
    duplicates,
  };
}

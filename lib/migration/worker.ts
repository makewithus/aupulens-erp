import mongoose from "mongoose";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import Customer from "@/models/sales/Customer";
import { ensureOpeningStockMovement, getHandler } from "@/lib/migration/importer";
import { toCanonicalRecord, validateRows } from "@/lib/migration/validation";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { resolveEntityReference, validateRelationships } from "@/lib/migration/resolver";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import { after } from "next/server";
import { dedupeProductsForTenant } from "@/lib/migration/productDedupe";
import { productionMigrationError } from "@/lib/migration/errors";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";
import { deterministicMapping as buildDeterministicMapping } from "@/lib/migration/deterministicMapping";
import { checkJournalAccountDependencies } from "@/lib/migration/dependencyCheck";

const ENTITY_MIGRATION_PRIORITY: Record<string, number> = {
  [MIGRATION_ENTITY.ACCOUNT]: 10,
  [MIGRATION_ENTITY.JOURNAL_ENTRY]: 25,
  [MIGRATION_ENTITY.CUSTOMER]: 20,
  [MIGRATION_ENTITY.VENDOR]: 20,
  [MIGRATION_ENTITY.PRODUCT]: 20,
  [MIGRATION_ENTITY.EMPLOYEE]: 20,
  [MIGRATION_ENTITY.SALES_ORDER]: 30,
  [MIGRATION_ENTITY.SALES_INVOICE]: 30,
  [MIGRATION_ENTITY.PURCHASE_INVOICE]: 30,
  [MIGRATION_ENTITY.SALES_ORDER_LINE]: 40,
  [MIGRATION_ENTITY.INVOICE_ITEM]: 40,
  [MIGRATION_ENTITY.PAYMENT]: 50,
  [MIGRATION_ENTITY.EXPENSE]: 50,
};

async function nextDependencyStage(batch: any, statusFilter: Record<string, unknown>, limit: number) {
  const filter = { batchId: batch._id, tenantId: batch.tenantId, ...statusFilter };
  const entities: string[] = await MigrationRecord.distinct("entityType", filter);
  if (entities.length === 0) return [];
  const priority = Math.min(...entities.map((entity) => ENTITY_MIGRATION_PRIORITY[entity] ?? 999));
  // Choose the stage across the WHOLE batch before limiting rows. Sorting a
  // limited result lets valid journals overtake duplicate-resolved Accounts
  // because the status index can return all valid rows before duplicates.
  return MigrationRecord.find({
    ...filter,
    entityType: { $in: entities.filter((entity) => (ENTITY_MIGRATION_PRIORITY[entity] ?? 999) === priority) },
  }).sort({ _id: 1 }).limit(limit);
}

const IN_FILE_DUPLICATE_EXEMPT_ENTITIES = new Set<string>([
  MIGRATION_ENTITY.INVOICE_ITEM,
  MIGRATION_ENTITY.SALES_ORDER_LINE,
]);

interface DuplicateSignature {
  key: string;
  fields: string[];
}

function normalizedDuplicateValue(value?: string) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed.replace(/\s+/g, " ") : "";
}

function signatureFromFields(entityType: string, canonical: Record<string, string>, fields: string[]): DuplicateSignature | null {
  const values = fields.map((field) => normalizedDuplicateValue(canonical[field]));
  if (values.some((value) => !value)) return null;
  return {
    key: `${entityType}:${fields.join("+")}:${values.join("|")}`,
    fields,
  };
}

function duplicateSignatures(entityType: string, schema: any, canonical: Record<string, string>): DuplicateSignature[] {
  if (IN_FILE_DUPLICATE_EXEMPT_ENTITIES.has(entityType)) return [];

  const signatures: DuplicateSignature[] = [];
  const add = (fields: string[]) => {
    const signature = signatureFromFields(entityType, canonical, fields);
    if (signature && !signatures.some((item) => item.key === signature.key)) {
      signatures.push(signature);
    }
  };

  if (entityType === MIGRATION_ENTITY.CUSTOMER) {
    add(["gstin"]);
    add(["email"]);
    add(["name", "phone"]);
    add(["name", "mobile"]);
    add(["name"]);
  } else if (entityType === MIGRATION_ENTITY.VENDOR) {
    add(["gstin"]);
    add(["contactEmail"]);
    add(["name", "phone"]);
    add(["name"]);
  } else if (entityType === MIGRATION_ENTITY.PRODUCT) {
    add(["sku"]);
    if (signatures.length > 0) return signatures;
    add(["name", "brand", "category"]);
    add(["name", "brand"]);
    add(["name", "category"]);
    add(["name"]);
  } else if (entityType === MIGRATION_ENTITY.PAYMENT) {
    add(["reference"]);
    if (signatures.length > 0) return signatures;
    add(["sourceId"]);
  } else if (entityType === MIGRATION_ENTITY.PURCHASE_INVOICE) {
    // Supplier invoice numbers are only unique within a supplier. Legacy
    // exports can legitimately reuse the same bill number for different vendors.
    add(["number", "vendorName"]);
  } else if (entityType === MIGRATION_ENTITY.ACCOUNT) {
    add(["accountName", "accountCode"]);
    add(["accountCode"]);
    add(["accountName"]);
  } else {
    const fields = (schema.dedupeKeys || []).filter((key: string) => !!canonical[key]);
    if (fields.length > 0) add(fields);
  }

  return signatures;
}

function duplicateFieldsFromSignatures(signatures: DuplicateSignature[]): string[] {
  return [...new Set(signatures.flatMap((signature) => signature.fields))];
}

function duplicateFiltersFromSignatures(
  batch: any,
  canonical: Record<string, string>,
  signatures: DuplicateSignature[],
  currentRecordId: any,
) {
  return signatures.map((signature) => {
    const filter: Record<string, unknown> = {
      batchId: batch._id,
      tenantId: batch.tenantId,
      _id: { $ne: currentRecordId },
      status: { $in: ["valid", "duplicate", "migrated"] },
    };
    for (const field of signature.fields) {
      filter[`mappedData.${field}`] = canonical[field];
    }
    return filter;
  });
}

function identitySourceIds(entityType: string, canonical: Record<string, string>): string[] {
  const ids = new Set<string>();
  const add = (value?: string) => {
    const trimmed = value?.trim();
    if (trimmed) ids.add(trimmed);
  };

  add(canonical.sourceId);
  if (entityType === MIGRATION_ENTITY.CUSTOMER || entityType === MIGRATION_ENTITY.VENDOR) {
    add(canonical.name);
    add(canonical.gstin);
    add(canonical.email || canonical.contactEmail);
  }
  if (entityType === MIGRATION_ENTITY.PRODUCT) {
    add(canonical.name);
    add(canonical.sku);
  }
  if (entityType === MIGRATION_ENTITY.SALES_ORDER) {
    add(canonical.number);
  }
  if (entityType === MIGRATION_ENTITY.ACCOUNT) {
    add(canonical.accountName);
    add(canonical.accountCode);
  }
  if (entityType === MIGRATION_ENTITY.JOURNAL_ENTRY) {
    add(canonical.journalId);
  }
  if (entityType === MIGRATION_ENTITY.EMPLOYEE) {
    add([canonical.firstName, canonical.lastName].filter(Boolean).join(" "));
    add(canonical.email);
    add(canonical.employeeId);
  }
  if (entityType === MIGRATION_ENTITY.SALES_INVOICE || entityType === MIGRATION_ENTITY.PURCHASE_INVOICE) {
    add(canonical.number);
  }
  if (entityType === MIGRATION_ENTITY.INVOICE_ITEM) {
    add(`${canonical.invoiceSourceId || ""}-${canonical.productName || ""}`);
  }
  if (entityType === MIGRATION_ENTITY.SALES_ORDER_LINE) {
    add(`${canonical.orderSourceId || ""}-${canonical.productName || ""}`);
  }
  if (entityType === MIGRATION_ENTITY.PAYMENT) {
    add(canonical.reference);
  }

  return [...ids];
}

function stableFilterKey(filter: Record<string, unknown>) {
  return JSON.stringify(Object.keys(filter).sort().map((key) => [key, filter[key]]));
}

function normalizeCanonicalRecord(entityType: string, canonical: Record<string, string>): Record<string, string> {
  const numeric = (value?: string) => {
    const parsed = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  if (entityType === MIGRATION_ENTITY.EMPLOYEE && canonical.firstName && !canonical.lastName && canonical.firstName.includes(" ")) {
    const parts = canonical.firstName.trim().split(/\s+/);
    canonical.firstName = parts.shift() || canonical.firstName;
    canonical.lastName = parts.join(" ");
  }
  if (entityType === MIGRATION_ENTITY.PRODUCT && !canonical.sku && canonical.sourceId) {
    canonical.sku = canonical.sourceId;
  }
  if (entityType === MIGRATION_ENTITY.PRODUCT && !canonical.sourceId && canonical.sku) {
    canonical.sourceId = canonical.sku;
  }
  if (entityType === MIGRATION_ENTITY.EMPLOYEE && !canonical.sourceId && canonical.employeeId) {
    canonical.sourceId = canonical.employeeId;
  }
  if (entityType === MIGRATION_ENTITY.SALES_INVOICE) {
    if (!canonical.sourceId && canonical.number) canonical.sourceId = canonical.number;
    if (!canonical.number && canonical.sourceId) canonical.number = canonical.sourceId;
    if (!canonical.totalAmount) canonical.totalAmount = "0";
  }
  if (entityType === MIGRATION_ENTITY.SALES_ORDER) {
    if (!canonical.sourceId && canonical.number) canonical.sourceId = canonical.number;
    if (!canonical.number && canonical.sourceId) canonical.number = canonical.sourceId;
    if (!canonical.totalAmount) canonical.totalAmount = "0";
  }
  if (entityType === MIGRATION_ENTITY.INVOICE_ITEM) {
    if (!canonical.productName && canonical.productSourceId) canonical.productName = canonical.productSourceId;
    if (!canonical.lineTotal) canonical.lineTotal = String(numeric(canonical.qty) * numeric(canonical.unitPrice));
  }
  if (entityType === MIGRATION_ENTITY.SALES_ORDER_LINE) {
    if (!canonical.productName && canonical.productSourceId) canonical.productName = canonical.productSourceId;
    if (!canonical.lineTotal) canonical.lineTotal = String(numeric(canonical.qty) * numeric(canonical.unitPrice));
  }
  if (entityType === MIGRATION_ENTITY.PAYMENT) {
    const type = canonical.type?.trim().toLowerCase();
    if (!type || ["cleared", "paid", "posted", "received", "reconciled", "banktransfer", "bank transfer", "upi"].includes(type)) {
      canonical.type = "Receipt";
    }
    if (!canonical.reference && canonical.sourceId) canonical.reference = canonical.sourceId;
  }
  return canonical;
}

async function applyForceCreateUniqueSuffix(
  handler: ReturnType<typeof getHandler>,
  rec: any,
  canonical: Record<string, string>,
  tenantId: string,
) {
  if (!handler?.uniqueConflictFilter || rec.duplicateAction !== "create") return canonical;

  const conflict = handler.uniqueConflictFilter(canonical, tenantId);
  if (!conflict) return canonical;

  const existing = await handler.model.exists(conflict.filter);
  const shouldMakeImportSafe = !!existing || rec.status === "duplicate" || !!rec.duplicateReason;
  if (!shouldMakeImportSafe) return canonical;

  const suffix = `MIG-${rec._id.toString().slice(-6)}`;
  for (const field of conflict.fields || []) {
    const current = canonical[field];
    if (!current) continue;
    if (!canonical.sourceId) canonical.sourceId = current;
    if (field === "email") {
      const atIndex = current.indexOf("@");
      canonical[field] = atIndex > 0
        ? `${current.slice(0, atIndex)}+${suffix.toLowerCase()}${current.slice(atIndex)}`
        : `${current}-${suffix}`;
    } else {
      canonical[field] = `${current}-${suffix}`;
    }
  }

  return canonical;
}

async function returnBatchToPreviewForConflicts(batch: any) {
  const records = await MigrationRecord.find({
    batchId: batch._id,
    tenantId: batch.tenantId,
    status: "duplicate",
    duplicateAction: "update",
  }).select("entityType mappedData duplicateAction duplicateTargetId");

  let conflicts = 0;
  for (const rec of records) {
    const handler = getHandler(rec.entityType);
    const conflict = handler?.uniqueConflictFilter?.((rec.mappedData || {}) as Record<string, string>, batch.tenantId);
    if (!handler || !conflict) continue;

    const filter = rec.duplicateAction === "update" && rec.duplicateTargetId
      ? { ...conflict.filter, _id: { $ne: rec.duplicateTargetId } }
      : conflict.filter;
    const existing = await handler.model.findOne(filter).select("_id").lean();
    if (!existing) continue;

    conflicts += 1;
    await MigrationRecord.updateOne(
      { _id: rec._id, tenantId: batch.tenantId },
      {
        $set: {
          status: "duplicate",
          duplicateReason: "database",
          duplicateFields: conflict.fields,
          duplicateTargetId: (existing as any)._id,
          errors: [{
            message: rec.duplicateAction === "update"
              ? `Merge / Update would conflict with another existing record using ${conflict.fields.join(", ")}. Choose Force Create or Skip before migration.`
              : `Existing workspace record uses unique field ${conflict.fields.join(", ")}. Resolve this duplicate before migration.`,
          }],
        },
        $unset: { duplicateAction: "" },
      },
    );
  }

  if (conflicts === 0) return false;

  const { valid, invalid, duplicate } = await computeMigrationReviewSummary(batch._id, batch.tenantId);
  batch.status = "preview";
  batch.progress = 100;
  batch.summary = { ...batch.summary, valid, invalid, duplicate };
  batch.workerLock = null;
  batch.workerHeartbeat = null;
  await batch.save();
  return true;
}

export async function runWriteReadinessCheck(batch: any, selectedRecords?: any[]) {
  const records = selectedRecords ?? await MigrationRecord.find({
    batchId: batch._id,
    tenantId: batch.tenantId,
    $or: [
      { status: "valid" },
      { status: "duplicate", duplicateAction: { $in: ["update", "create"] } },
    ],
  });

  let invalid = 0;
  // Bound concurrency so database latency does not serialize the whole batch.
  for (let offset = 0; offset < records.length; offset += 10) {
    await Promise.all(records.slice(offset, offset + 10).map(async (record) => {
      const handler = getHandler(record.entityType);
      if (!handler || handler.createOperation) return;

      try {
        const canonical = await applyForceCreateUniqueSuffix(handler, record,
          { ...(record.mappedData || {}) } as Record<string, string>, batch.tenantId);
        const transformed = await handler.transform(canonical, {
          tenantId: batch.tenantId,
          userId: batch.createdBy.toString(),
          batchId: batch._id.toString(),
          dryRun: true,
          resolveRef: async () => new mongoose.Types.ObjectId(),
        });
        const doc = new handler.model(transformed);
        await doc.validate();
      } catch (error) {
        invalid += 1;
        const message = productionMigrationError(error);
        await MigrationRecord.updateOne(
          { _id: record._id, tenantId: batch.tenantId },
          {
            $set: {
              status: "invalid",
              errors: [{ message: `Target module check failed: ${message}` }],
            },
            $unset: { duplicateAction: "", duplicateTargetId: "", duplicateReason: "", duplicateFields: "" },
          },
        );
      }
    }));
  }

  return invalid;
}

async function promoteExistingUniqueConflictsToReview(batch: any, recordIds: any[]) {
  const records = await MigrationRecord.find({
    batchId: batch._id,
    tenantId: batch.tenantId,
    status: "valid",
    _id: { $in: recordIds },
  }).select("entityType mappedData");

  let conflicts = 0;
  for (let offset = 0; offset < records.length; offset += 10) {
    await Promise.all(records.slice(offset, offset + 10).map(async (record) => {
      const handler = getHandler(record.entityType);
      const conflict = handler?.uniqueConflictFilter?.((record.mappedData || {}) as Record<string, string>, batch.tenantId);
      if (!handler || !conflict) return;

      const existing = await handler.model.findOne(conflict.filter).select("_id").lean();
      if (!existing) return;

      conflicts += 1;
      await MigrationRecord.updateOne(
        { _id: record._id, tenantId: batch.tenantId },
        {
          $set: {
            status: "duplicate",
            duplicateReason: "database",
            duplicateFields: conflict.fields,
            duplicateTargetId: (existing as any)._id,
            errors: [{ message: `Existing workspace record uses ${conflict.fields.join(", ")}. Choose Merge / Update, Force Create, or Skip before migration.` }],
          },
          $unset: { duplicateAction: "" },
        },
      );
    }));
  }

  return conflicts;
}

export async function startWorkerDaemon(batchId: string, origin: string) {
  const workerLock = new mongoose.Types.ObjectId().toString();
  await MigrationBatch.findByIdAndUpdate(batchId, {
    workerLock,
    workerHeartbeat: new Date()
  });

  after(async () => {
    try {
      const freshBatch = await MigrationBatch.findById(batchId).select("workerLock").lean();
      if (freshBatch?.workerLock !== workerLock) {
        console.log("Worker superseded, exiting chain");
        return;
      }

      const result = await processMigrationWorker(batchId, 500);

      if (!result.done) {
        await MigrationBatch.updateOne(
          { _id: batchId, workerLock },
          { $set: { workerHeartbeat: new Date() } }
        );
        // Chain the next chunk
        const url = `${origin}/api/migration/batches/${batchId}/worker`;
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workerLock }) }).catch(e => console.error("Worker fetch failed:", e));
      }
    } catch (e) {
      console.error("Worker chunk error:", e);
      await markBatchFailed(batchId, e);
    }
  });
}

export async function processMigrationWorker(batchId: string, limit = 500) {
  const processingToken = new mongoose.Types.ObjectId().toString();
  const leaseDuration = 120_000;
  const batch = await MigrationBatch.findOneAndUpdate(
    {
      _id: batchId,
      status: { $in: ["validating", "running"] },
      $or: [
        { processingToken: null },
        { processingExpiresAt: { $lte: new Date() } },
      ],
    },
    { $set: { processingToken, processingExpiresAt: new Date(Date.now() + leaseDuration) } },
    { new: true },
  );
  if (!batch) {
    const existing = await MigrationBatch.findById(batchId).select("status").lean();
    if (!existing) throw new Error("Batch not found");
    return { done: !["validating", "running"].includes(existing.status), processed: 0 };
  }

  // The daemon and browser polling can both request work. Only the lease owner
  // may process rows; keep its lease alive during slow database operations.
  const heartbeat = setInterval(() => {
    void MigrationBatch.updateOne(
      { _id: batchId, processingToken },
      { $set: { processingExpiresAt: new Date(Date.now() + leaseDuration) } },
    ).catch((error) => console.error("Migration lease heartbeat failed", error));
  }, 30_000);

  try {
    if (batch.status === "validating") return await runValidationChunk(batch, limit);
    return await runMigrationChunk(batch, limit);
  } finally {
    clearInterval(heartbeat);
    await MigrationBatch.updateOne(
      { _id: batchId, processingToken },
      { $unset: { processingToken: "", processingExpiresAt: "" } },
    );
  }
}

async function runValidationChunk(batch: any, limit: number) {
  if (!batch.progress || batch.progress < 1) {
    batch.progress = 1;
    await batch.save();
  }

  const records = await nextDependencyStage(batch, { status: "pending" }, limit);

  if (records.length === 0) {
    // Legacy batches already stuck at 99% also enter here. Persist a cursor
    // after each bounded page so request timeouts cannot restart a full scan.
    const finalRecords = await MigrationRecord.find({
      batchId: batch._id,
      tenantId: batch.tenantId,
      ...(batch.validationCursor ? { _id: { $gt: batch.validationCursor } } : {}),
      $or: [
        { status: "valid" },
        { status: "duplicate", duplicateAction: { $in: ["update", "create"] } },
      ],
    }).sort({ _id: 1 }).limit(Math.min(limit, 50));
    if (finalRecords.length > 0) {
      await runWriteReadinessCheck(batch, finalRecords);
      await promoteExistingUniqueConflictsToReview(batch, finalRecords.map((record) => record._id));
      batch.validationCursor = finalRecords[finalRecords.length - 1]._id;
      await batch.save();
      return { done: false, processed: finalRecords.length };
    }
    batch.validationCursor = undefined;
    batch.status = "preview";
    
    // Update summary counts
    const { valid, invalid, duplicate } = await computeMigrationReviewSummary(batch._id, batch.tenantId);
    batch.summary = { ...batch.summary, valid, invalid, duplicate };
    batch.progress = 100;
    await batch.save();
    return { done: true, processed: 0 };
  }

  // Newly queued rows invalidate final checks, including edits before the cursor.
  if (batch.validationCursor) {
    batch.validationCursor = undefined;
    await batch.save();
  }

  // Group by job to minimize lookups
  const recordsByJob = new Map<string, typeof records>();
  for (const r of records) {
    const jid = r.jobId.toString();
    if (!recordsByJob.has(jid)) recordsByJob.set(jid, []);
    recordsByJob.get(jid)!.push(r);
  }

  let processed = 0;
  const seenInThisChunk = new Set<string>();
  for (const [jid, jobRecords] of recordsByJob.entries()) {
    const job = await MigrationJob.findOne({ _id: jid, batchId: batch._id, tenantId: batch.tenantId });
    if (!job) continue;

    const schema = getEntitySchema(job.entityType);
    const handler = getHandler(job.entityType);
    if (!schema || !handler) {
      await MigrationRecord.updateMany(
        { _id: { $in: jobRecords.map((rec) => rec._id) }, tenantId: batch.tenantId },
        {
          $set: {
            status: "invalid",
            errors: [{ message: `Unsupported migration entity type: ${job.entityType}` }],
          },
        },
      );
      processed += jobRecords.length;
      continue;
    }

    // Heal stale mappings: if a required field is unmapped, try fresh deterministic mapping.
    // This fixes batches created before alias updates (e.g. 'Invoice No' → 'number').
    let mapping = (job.mapping || {}) as Record<string, string>;
    const missingRequiredFields = schema.fields.filter(f => f.required && !mapping[f.key]);
    if (missingRequiredFields.length > 0) {
      const freshMapping = buildDeterministicMapping(schema, job.columns || []);
      let healed = false;
      for (const field of missingRequiredFields) {
        if (freshMapping[field.key] && !mapping[field.key]) {
          mapping = { ...mapping, [field.key]: freshMapping[field.key] };
          healed = true;
        }
      }
      if (healed) {
        job.mapping = mapping as any;
        await job.save();
      }
    }
    
    const bulkWriteOps: any[] = [];
    
    const relationshipCache = new Map<string, any>();
    // Process records in chunks of 50 to avoid connection pool exhaustion
    const processedRecords = [];
    for (let i = 0; i < jobRecords.length; i += 50) {
      const chunk = jobRecords.slice(i, i + 50);
      const chunkResults = await Promise.all(chunk.map(async (rec) => {
        const canonical = normalizeCanonicalRecord(job.entityType, toCanonicalRecord(schema, rec.sourceData, mapping));
        const validation = validateRows(job.entityType, [rec.sourceData as Record<string, unknown>], mapping);
        const rowValidationErrors = validation.issues
          .filter((issue) => issue.rowIndex === 0 && issue.severity === "error")
          .map((issue) => ({ field: issue.field, message: issue.message }));
        const rowValidationWarnings = validation.issues
          .filter((issue) => issue.rowIndex === 0 && issue.severity === "warning")
          .map((issue) => ({ field: issue.field, message: issue.message }));
        
        const relationshipErrors = await validateRelationships(batch.tenantId, batch._id.toString(), job.entityType, canonical, relationshipCache);
        return { rec, canonical, rowValidationErrors, rowValidationWarnings, relationshipErrors };
      }));
      processedRecords.push(...chunkResults);
    }

    const preFetchUploadMap = new Map<string, boolean>();
    const preFetchDbMap = new Map<string, any>();
    
    // Process pre-fetches in chunks of 25 to avoid connection pool exhaustion while being much faster than sequential
    for (let i = 0; i < processedRecords.length; i += 25) {
      const chunk = processedRecords.slice(i, i + 25);
      await Promise.all(chunk.map(async ({ rec, canonical, relationshipErrors, rowValidationErrors }) => {
        if (relationshipErrors.length > 0 || rowValidationErrors.length > 0) return;
        const signatures = duplicateSignatures(job.entityType, schema, canonical);
        if (signatures.length === 0) return;
        
        const uFilters = duplicateFiltersFromSignatures(batch, canonical, signatures, rec._id);
        if (uFilters.length > 0) {
          const exists = await MigrationRecord.exists({ $or: uFilters });
          preFetchUploadMap.set(rec._id.toString(), !!exists);
        }
        
        const dFilter = handler.existingFilter(canonical, batch.tenantId);
        if (dFilter) {
          const existingDoc = await handler.model.findOne(dFilter).select("_id").lean();
          preFetchDbMap.set(rec._id.toString(), existingDoc ? (existingDoc as any)._id : null);
        }
      }));
    }

    // Evaluate duplicates sequentially to maintain `seenInThisChunk` state properly
    for (const { rec, canonical, rowValidationErrors, rowValidationWarnings, relationshipErrors } of processedRecords) {
      const update: Record<string, any> = {
        mappedData: canonical,
        warnings: rowValidationWarnings,
      };
      
      if (relationshipErrors.length > 0 || rowValidationErrors.length > 0) {
        update.status = "invalid";
        update.errors = [
          ...rowValidationErrors,
          ...relationshipErrors
        ];
      } else {
        update.status = "valid";
        update.errors = [];
        
        const signatures = duplicateSignatures(job.entityType, schema, canonical);
        if (signatures.length > 0) {
          const matchedUploadSignatures = signatures.filter((signature) => seenInThisChunk.has(signature.key));
          const priorUploadDuplicate = matchedUploadSignatures.length > 0 || preFetchUploadMap.get(rec._id.toString());
          const signatureFields = duplicateFieldsFromSignatures(
            matchedUploadSignatures.length > 0 ? matchedUploadSignatures : signatures,
          );

          if (priorUploadDuplicate) {
            update.status = "duplicate";
            update.duplicateReason = "upload";
            update.duplicateFields = signatureFields;
            update.errors = [{ message: `Duplicate record found in uploaded data using ${update.duplicateFields.join(", ")}.` }];
          } else {
            for (const signature of signatures) {
              seenInThisChunk.add(signature.key);
            }

            // Check real DB
            const existingDocId = preFetchDbMap.get(rec._id.toString());
            if (existingDocId) {
              update.status = "duplicate";
              update.duplicateTargetId = existingDocId;
              update.duplicateReason = "database";
              update.duplicateFields = signatureFields;
              update.errors = [{ message: `Duplicate record found in workspace using ${update.duplicateFields.join(", ")}.` }];
            }
          }
        }
      }
      
      const updateDoc: Record<string, any> = { $set: update };
      if (update.status !== "duplicate") {
        updateDoc.$unset = { duplicateAction: "", duplicateTargetId: "", duplicateReason: "", duplicateFields: "" };
      }
      bulkWriteOps.push({
        updateOne: {
          filter: { _id: rec._id, tenantId: batch.tenantId, status: "pending" },
          update: updateDoc
        }
      });
    }

    if (bulkWriteOps.length > 0) {
      const write = await MigrationRecord.bulkWrite(bulkWriteOps);
      processed += write.modifiedCount || 0;
    }
  }

  // Update validation progress
  const [pendingCount, recordTotal] = await Promise.all([
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "pending" }),
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId }),
  ]);
  const total = recordTotal || 1;
  batch.progress = Math.min(99, Math.max(1, Math.floor(((total - pendingCount) / total) * 100)));
  await batch.save();

  return { done: false, processed };
}

async function runMigrationChunk(batch: any, limit: number) {
  if (!batch.progress || batch.progress < 1) {
    batch.progress = 1;
    await batch.save();
  }

  if (await returnBatchToPreviewForConflicts(batch)) {
    return { done: true, processed: 0, message: "Migration paused for duplicate review." };
  }

  await MigrationRecord.updateMany(
    { batchId: batch._id, tenantId: batch.tenantId, status: "duplicate", duplicateAction: "skip" },
    { $set: { status: "skipped" } },
  );

  const records = await nextDependencyStage(batch, {
    $or: [
      { status: "valid" },
      { status: "duplicate", duplicateAction: { $in: ["update", "create"] } }
    ]
  }, limit);

  if (records.length === 0) {
    const pendingCount = await MigrationRecord.countDocuments({
      batchId: batch._id,
      tenantId: batch.tenantId,
      $or: [
        { status: "valid" },
        { status: "duplicate", duplicateAction: { $in: ["update", "create"] } },
      ],
    });
    if (pendingCount === 0) {
      await finalizeMigrationBatch(batch);
      return { done: true, processed: 0 };
    }
    return { done: false, processed: 0, message: "Waiting" };
  }

  const recordsByJob = new Map<string, typeof records>();
  for (const r of records) {
    const jid = r.jobId.toString();
    if (!recordsByJob.has(jid)) recordsByJob.set(jid, []);
    recordsByJob.get(jid)!.push(r);
  }

  let processed = 0;
  for (const [jid, jobRecords] of recordsByJob.entries()) {
    const job = await MigrationJob.findOne({ _id: jid, batchId: batch._id, tenantId: batch.tenantId });
    if (!job) continue;

    const schema = getEntitySchema(job.entityType);
    const handler = getHandler(job.entityType);
    if (!schema || !handler) continue;

    const bulkOps: any[] = [];
    const bulkRecordIds: any[] = [];
    const migrationRecordUpdates: any[] = [];
    const identityMapInserts: any[] = [];
    const pendingTargets = new Map<string, { docId: any; insertOpIndex: number | null }>();
    const newlyInsertedProductIds = new Set<string>();
    const productOpeningStockRequests: { recordId: any; productId: mongoose.Types.ObjectId; quantity: number; type: string }[] = [];

    const resolveCache = new Map<string, any>();
    const importContext = {
      tenantId: batch.tenantId, 
      userId: batch.createdBy.toString(),
      batchId: batch._id.toString(),
      resolveRef: (entityType: string, sourceId: string) => resolveEntityReference(batch.tenantId, batch._id.toString(), entityType, sourceId, resolveCache)
    };

    const transformedRecords = await Promise.all(jobRecords.map(async (rec) => {
      if (rec.duplicateAction === "skip") return { rec, skip: true };
      
      const sourceCanonical = normalizeCanonicalRecord(job.entityType, toCanonicalRecord(schema, rec.sourceData, job.mapping as Record<string, string>));
      const sourceIds = identitySourceIds(job.entityType, sourceCanonical);
      const canonical = await applyForceCreateUniqueSuffix(
        handler,
        rec,
        { ...sourceCanonical },
        batch.tenantId,
      );
      
      try {
        const transformData = await handler.transform(canonical, importContext);
        return { rec, canonical, sourceIds, transformData, error: null };
      } catch (err) {
        return { rec, canonical, transformData: null, error: err };
      }
    }));

    for (const { rec, skip, canonical, sourceIds, transformData, error } of transformedRecords) {
      if (skip) {
        migrationRecordUpdates.push({ updateOne: { filter: { _id: rec._id }, update: { $set: { status: "skipped" } } } });
        processed++;
        continue;
      }
      
      if (error) {
        migrationRecordUpdates.push({ updateOne: { filter: { _id: rec._id }, update: { $set: { status: "failed", errors: [{ message: productionMigrationError(error) }] } } } });
        processed++;
        continue;
      }
      
      if (!transformData || !canonical) continue;
      
      try {
        let docId: any;
        if (rec.duplicateAction === "update" && rec.duplicateTargetId) {
          docId = rec.duplicateTargetId;
          bulkOps.push({ updateOne: { filter: { _id: docId }, update: { $set: transformData } } });
        } else {
          const conflict = rec.duplicateAction !== "create"
            ? handler.uniqueConflictFilter?.(canonical, batch.tenantId)
            : null;
          const conflictKey = conflict ? stableFilterKey(conflict.filter) : null;
          const pendingTarget = conflictKey ? pendingTargets.get(conflictKey) : null;
          
          let existingDoc = null;
          if (!pendingTarget && conflict && conflictKey) {
            if (resolveCache.has(`conflict:${conflictKey}`)) {
               existingDoc = resolveCache.get(`conflict:${conflictKey}`);
            } else {
               existingDoc = await handler.model.findOne(conflict.filter).select("_id").lean();
               resolveCache.set(`conflict:${conflictKey}`, existingDoc);
            }
          }

          if (pendingTarget) {
            docId = pendingTarget.docId;
            bulkOps.push({ updateOne: { filter: { _id: docId }, update: { $set: transformData } } });
          } else if (existingDoc) {
            docId = (existingDoc as any)._id;
            bulkOps.push({ updateOne: { filter: { _id: docId }, update: { $set: transformData } } });
            if (conflictKey) pendingTargets.set(conflictKey, { docId, insertOpIndex: null });
          } else if (handler.createOperation) {
            docId = transformData._id || new mongoose.Types.ObjectId();
            if (!transformData._id) transformData._id = docId;
            bulkOps.push(handler.createOperation(transformData, canonical, importContext));
            if (conflictKey) pendingTargets.set(conflictKey, { docId, insertOpIndex: null });
          } else {
            docId = new mongoose.Types.ObjectId();
            transformData._id = docId;
            const insertOpIndex = bulkOps.length;
            bulkOps.push({ insertOne: { document: transformData } });
            if (job.entityType === MIGRATION_ENTITY.PRODUCT) newlyInsertedProductIds.add(String(docId));
            if (conflictKey) pendingTargets.set(conflictKey, { docId, insertOpIndex });
          }
        }
        bulkRecordIds.push(rec._id);

        if (job.entityType === MIGRATION_ENTITY.PRODUCT) {
          const quantity = Number(String(canonical.stockQuantity || "").replace(/,/g, ""));
          const productType = String((transformData as any).tab_general_information?.type || "consu");
          if (Number.isFinite(quantity) && quantity > 0 && productType !== "service") {
            productOpeningStockRequests.push({ recordId: rec._id, productId: docId, quantity, type: productType });
          }
        }
        
        migrationRecordUpdates.push({ updateOne: { filter: { _id: rec._id }, update: { $set: { status: "migrated", targetRecordId: docId } } } });
        if (job.entityType !== MIGRATION_ENTITY.PRODUCT) {
          job.importedRefs.push({ model: handler.modelName, id: docId });
        }

        // Force Create changes target unique values, never source identities.
        // Journals/invoices/receipts still refer to the original workbook IDs.
        for (const sourceId of new Set([...(sourceIds || []), ...identitySourceIds(job.entityType, canonical)])) {
          identityMapInserts.push({
            updateOne: {
              filter: { tenantId: batch.tenantId, batchId: batch._id, entityType: job.entityType, sourceId },
              update: { $set: { targetId: docId } },
              upsert: true,
            }
          });
        }
      } catch (err: any) {
        migrationRecordUpdates.push({ updateOne: { filter: { _id: rec._id }, update: { $set: { status: "failed", errors: [{ message: productionMigrationError(err) }] } } } });
      }
      processed++;
    }
    
    if (bulkOps.length > 0) {
      try {
        await handler.model.bulkWrite(bulkOps, { ordered: job.entityType === MIGRATION_ENTITY.PRODUCT });
        if (job.entityType === MIGRATION_ENTITY.PRODUCT) {
          await dedupeProductsForTenant(batch.tenantId);
          for (const productId of newlyInsertedProductIds) {
            job.importedRefs.push({ model: "Product", id: new mongoose.Types.ObjectId(productId) });
          }
          for (const request of productOpeningStockRequests) {
            try {
              const stockId = await ensureOpeningStockMovement(request.productId, request.quantity, {
                tenantId: batch.tenantId,
                userId: batch.createdBy.toString(),
                batchId: batch._id.toString(),
                resolveRef: async () => null,
              });
              if (stockId) job.importedRefs.push({ model: "Stock", id: stockId });
            } catch (error) {
              const update = migrationRecordUpdates.find((item) => String(item.updateOne.filter._id) === String(request.recordId));
              if (update) {
                update.updateOne.update = { $set: { status: "failed", errors: [{ message: productionMigrationError(error) }] } };
              }
            }
          }
        }
      } catch (err: any) {
        if (err.writeErrors) {
          for (const writeError of err.writeErrors) {
            const index = writeError.index;
            const recId = bulkRecordIds[index];
            const updateObj = migrationRecordUpdates.find(u => u.updateOne.filter._id === recId);
            if (updateObj) {
              updateObj.updateOne.update = { $set: { status: "failed", errors: [{ message: productionMigrationError(writeError.errmsg || "Database error") }] } };
            }
          }
        } else {
          console.error("BulkWrite error:", err);
        }
      }
    }
    if (job.entityType === MIGRATION_ENTITY.PURCHASE_INVOICE) {
      const usedPartnerIds = new Set(
        job.importedRefs.filter((ref: any) => ref.model === "Customer").map((ref: any) => String(ref.id)),
      );
      for (const transformed of transformedRecords) {
        if (transformed.skip || transformed.error || !transformed.transformData) continue;
        const rowUpdate = migrationRecordUpdates.find((item) => String(item.updateOne.filter._id) === String(transformed.rec._id));
        if (rowUpdate?.updateOne.update.$set.status !== "migrated") continue;
        const partnerId = (transformed.transformData as any).partnerId;
        if (partnerId) usedPartnerIds.add(String(partnerId));
      }
      const batchPartners = await Customer.find({
        tenantId: batch.tenantId,
        "customFields.migrationPartnerType": "vendor",
        "customFields.migrationBatchId": batch._id.toString(),
      }).select("_id").lean();
      const used = batchPartners.filter((partner) => usedPartnerIds.has(String(partner._id)));
      const orphanIds = batchPartners.filter((partner) => !usedPartnerIds.has(String(partner._id))).map((partner) => partner._id);
      if (orphanIds.length > 0) {
        await Customer.deleteMany({ _id: { $in: orphanIds }, tenantId: batch.tenantId });
      }
      for (const partner of used) {
        if (!job.importedRefs.some((ref: any) => ref.model === "Customer" && String(ref.id) === String(partner._id))) {
          job.importedRefs.push({ model: "Customer", id: partner._id as mongoose.Types.ObjectId });
        }
      }
    }
    if (migrationRecordUpdates.length > 0) {
      await MigrationRecord.bulkWrite(migrationRecordUpdates, { ordered: false });
    }
    if (identityMapInserts.length > 0) {
      await MigrationIdentityMap.bulkWrite(identityMapInserts, { ordered: false });
    }
    
    await job.save();

    // Account validation can pass while the actual target write still fails
    // (for example, a tenant-specific unique constraint). Never let dependent
    // journals turn that target-side problem into dozens of late failed rows.
    // Return to preview as soon as the Account job has finished, with the
    // affected rows editable and no journal writes attempted.
    if (job.entityType === MIGRATION_ENTITY.ACCOUNT) {
      const hasJournalJob = await MigrationJob.exists({
        batchId: batch._id,
        tenantId: batch.tenantId,
        entityType: MIGRATION_ENTITY.JOURNAL_ENTRY,
      });
      if (hasJournalJob) {
        const dependencies = await checkJournalAccountDependencies(batch._id, batch.tenantId);
        if (!dependencies.ready) {
          const [review, migrated, skipped, failed] = await Promise.all([
            computeMigrationReviewSummary(batch._id, batch.tenantId),
            MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "migrated" }),
            MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "skipped" }),
            MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "failed" }),
          ]);
          batch.status = "preview";
          batch.progress = 100;
          batch.summary = { ...batch.summary, ...review, migrated: migrated + skipped, failed };
          batch.workerLock = null;
          batch.workerHeartbeat = null;
          await batch.save();
          return {
            done: true,
            processed,
            message: "Migration paused before journal import because one or more referenced accounts were not saved. Review the Account and journal rows; no dependent journal entries were written.",
          };
        }
      }
    }
  }

  const [migratedCount, skippedCount, failedCount, remainingCount] = await Promise.all([
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "migrated" }),
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "skipped" }),
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "failed" }),
    MigrationRecord.countDocuments({
      batchId: batch._id,
      tenantId: batch.tenantId,
      $or: [
        { status: "valid" },
        { status: "duplicate", duplicateAction: { $in: ["update", "create"] } },
      ],
    }),
  ]);
  const total = migratedCount + skippedCount + failedCount + remainingCount || 1;
  batch.progress = Math.min(100, Math.max(1, Math.floor(((migratedCount + skippedCount + failedCount) / total) * 100)));
  await batch.save();

  if (remainingCount === 0) {
    await finalizeMigrationBatch(batch);
    return { done: true, processed };
  }

  return { done: false, processed };
}

async function finalizeMigrationBatch(batch: any) {
  batch.status = "verifying";
  await batch.save();

  const hasProductJob = await MigrationJob.exists({ batchId: batch._id, tenantId: batch.tenantId, entityType: MIGRATION_ENTITY.PRODUCT });
  if (hasProductJob) {
    await dedupeProductsForTenant(batch.tenantId);
  }

  await runPostMigrationVerification(batch);

  const [migratedRows, skippedRows] = await Promise.all([
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "migrated" }),
    MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "skipped" }),
  ]);
  const migrated = migratedRows + skippedRows;
  const failed = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "failed" });
  batch.summary = { ...batch.summary, migrated, failed };
  if (failed > 0 && batch.status === "verified") {
    batch.status = "completed";
  }
  batch.progress = 100;
  batch.workerLock = null;
  batch.workerHeartbeat = null;
  await batch.save();
}

export async function markBatchFailed(batchId: string, error: unknown) {
  const message = productionMigrationError(error);
  await MigrationBatch.findByIdAndUpdate(batchId, {
    $set: {
      status: "failed",
      workerLock: null,
      workerHeartbeat: null,
      errors: [{ message }],
    },
  });
}

async function runPostMigrationVerification(batch: any) {
  const jobs = await MigrationJob.find({ batchId: batch._id, tenantId: batch.tenantId });
  
  const verification = {
    sourceVsTarget: [] as any[],
    status: "PASS"
  };

  for (const job of jobs) {
    const handler = getHandler(job.entityType);
    if (!handler) continue;

    const sourceCount = await MigrationRecord.countDocuments({ jobId: job._id, tenantId: batch.tenantId });
    const failedCount = await MigrationRecord.countDocuments({ jobId: job._id, tenantId: batch.tenantId, status: "failed" });
    const skippedCount = await MigrationRecord.countDocuments({ jobId: job._id, tenantId: batch.tenantId, status: "skipped" });
    const validMigrated = await MigrationRecord.find({ jobId: job._id, tenantId: batch.tenantId, status: "migrated", targetRecordId: { $exists: true } }).select("targetRecordId");
    const processedCount = validMigrated.length + skippedCount;
    
    let targetCount = 0;
    if (validMigrated.length > 0) {
      if (job.entityType === MIGRATION_ENTITY.INVOICE_ITEM) {
        const invoices = await handler.model
          .find({ tenantId: batch.tenantId, _id: { $in: validMigrated.map(r => r.targetRecordId) } })
          .select("lineItems")
          .lean();
        targetCount = invoices.reduce((sum: number, invoice: any) => sum + (invoice.lineItems?.length ?? 0), 0);
      } else {
        targetCount = await handler.model.countDocuments({ tenantId: batch.tenantId, _id: { $in: validMigrated.map(r => r.targetRecordId) } });
      }
    }

    const expectedTarget = sourceCount - failedCount;
    let passed = processedCount === expectedTarget && failedCount === 0;
    let orphanCount = 0;

    if (job.entityType === MIGRATION_ENTITY.SALES_INVOICE) {
      const orphans = await handler.model.aggregate([
        { $match: { tenantId: batch.tenantId, _id: { $in: validMigrated.map(r => r.targetRecordId) } } },
        { $lookup: { from: "customers", localField: "customerId", foreignField: "_id", as: "ref" } },
        { $match: { ref: { $size: 0 } } }
      ]);
      orphanCount += orphans.length;
    }
    
    if (job.entityType === MIGRATION_ENTITY.PURCHASE_INVOICE) {
      const orphans = await handler.model.aggregate([
        { $match: { tenantId: batch.tenantId, _id: { $in: validMigrated.map(r => r.targetRecordId) } } },
        { $lookup: { from: "vendors", localField: "partnerId", foreignField: "_id", as: "ref" } },
        { $match: { ref: { $size: 0 } } }
      ]);
      orphanCount += orphans.length;
    }
    
    if (orphanCount > 0) passed = false;
    
    verification.sourceVsTarget.push({
      entity: job.entityType,
      sourceCount,
      targetCount: processedCount,
      actualTargetCount: targetCount,
      failedCount,
      orphanCount,
      status: passed ? "PASS" : "FAIL"
    });
    
    if (!passed) verification.status = "FAIL";
  }

  batch.summary = { ...batch.summary, verification };
  batch.status = verification.status === "PASS" ? "verified" : "completed";
}


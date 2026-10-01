import mongoose from "mongoose";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { getHandler } from "@/lib/migration/importer";
import { toCanonicalRecord, dedupeSignature } from "@/lib/migration/validation";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { resolveEntityReference, validateRelationships } from "@/lib/migration/resolver";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import { after } from "next/server";

const ENTITY_MIGRATION_PRIORITY: Record<string, number> = {
  [MIGRATION_ENTITY.ACCOUNT]: 10,
  [MIGRATION_ENTITY.CUSTOMER]: 20,
  [MIGRATION_ENTITY.VENDOR]: 20,
  [MIGRATION_ENTITY.PRODUCT]: 20,
  [MIGRATION_ENTITY.EMPLOYEE]: 20,
  [MIGRATION_ENTITY.SALES_INVOICE]: 30,
  [MIGRATION_ENTITY.PURCHASE_INVOICE]: 30,
  [MIGRATION_ENTITY.INVOICE_ITEM]: 40,
  [MIGRATION_ENTITY.PAYMENT]: 50,
  [MIGRATION_ENTITY.EXPENSE]: 50,
};

const IN_FILE_DUPLICATE_EXEMPT_ENTITIES = new Set<string>([
  MIGRATION_ENTITY.INVOICE_ITEM,
]);

function duplicateSignature(entityType: string, schema: any, canonical: Record<string, string>): string | null {
  if (IN_FILE_DUPLICATE_EXEMPT_ENTITIES.has(entityType)) return null;
  return dedupeSignature(schema, canonical);
}

function duplicateFilterFromSignature(
  batch: any,
  schema: any,
  canonical: Record<string, string>,
  currentRecordId: any,
) {
  const filter: Record<string, unknown> = {
    batchId: batch._id,
    tenantId: batch.tenantId,
    _id: { $ne: currentRecordId },
    status: { $in: ["valid", "duplicate", "migrated"] },
  };

  let hasKeys = false;
  for (const key of schema.dedupeKeys || []) {
    const value = canonical[key];
    if (!value) continue;
    filter[`mappedData.${key}`] = value;
    hasKeys = true;
  }

  return hasKeys ? filter : null;
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
  if (entityType === MIGRATION_ENTITY.ACCOUNT) {
    add(canonical.accountName);
    add(canonical.accountCode);
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
  if (entityType === MIGRATION_ENTITY.PAYMENT) {
    add(canonical.reference);
  }

  return [...ids];
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
  const batch = await MigrationBatch.findById(batchId);
  if (!batch) throw new Error("Batch not found");

  if (batch.status === "validating") {
    return await runValidationChunk(batch, limit);
  } else if (batch.status === "running") {
    return await runMigrationChunk(batch, limit);
  }
  
  return { done: true, processed: 0 };
}

async function runValidationChunk(batch: any, limit: number) {
  const records = await MigrationRecord.find({
    batchId: batch._id,
    tenantId: batch.tenantId,
    status: "pending"
  }).limit(limit);

  if (records.length === 0) {
    batch.status = "preview";
    
    // Update summary counts
    const valid = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "valid" });
    const invalid = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "invalid" });
    const duplicate = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "duplicate" });
    batch.summary = { ...batch.summary, valid, invalid, duplicate };
    batch.progress = 100;
    await batch.save();
    return { done: true, processed: 0 };
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

    const mapping = (job.mapping || {}) as Record<string, string>;
    
    for (const rec of jobRecords) {
      const canonical = toCanonicalRecord(schema, rec.sourceData, mapping);
      rec.mappedData = canonical;
      
      const missingRequired = schema.fields.filter(f => f.required && !canonical[f.key]);
      const relationshipErrors = await validateRelationships(batch.tenantId, batch._id.toString(), job.entityType, canonical);
      
      if (missingRequired.length > 0 || relationshipErrors.length > 0) {
        rec.status = "invalid";
        rec.errors = [
          ...missingRequired.map(f => ({ field: f.key, message: `Missing required field: ${f.label}` })),
          ...relationshipErrors
        ] as any;
      } else {
        rec.status = "valid";
        rec.errors = [] as any;
        
        const sig = duplicateSignature(job.entityType, schema, canonical);
        if (sig) {
          const priorUploadDuplicate = seenInThisChunk.has(sig)
            || (await MigrationRecord.exists(duplicateFilterFromSignature(batch, schema, canonical, rec._id)));

          if (priorUploadDuplicate) {
            rec.status = "duplicate";
            rec.errors = [{ message: "Duplicate record found in uploaded data." }] as any;
          } else {
            seenInThisChunk.add(sig);

            // Check real DB
            const filter = handler.existingFilter(canonical, batch.tenantId);
            if (filter) {
              const existingDoc = await handler.model.findOne(filter).select("_id").lean();
              if (existingDoc) {
                rec.status = "duplicate";
                rec.duplicateTargetId = (existingDoc as any)._id;
                rec.errors = [{ message: "Duplicate record found in database." }] as any;
              }
            }
          }
        }
      }
      await rec.save();
      processed++;
    }
  }

  // Update validation progress
  const pendingCount = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "pending" });
  const total = batch.totalRecords || 1;
  batch.progress = Math.min(99, Math.floor(((total - pendingCount) / total) * 100));
  await batch.save();

  return { done: false, processed };
}

async function runMigrationChunk(batch: any, limit: number) {
  await MigrationRecord.updateMany(
    { batchId: batch._id, tenantId: batch.tenantId, status: "duplicate", duplicateAction: "skip" },
    { $set: { status: "migrated" } },
  );

  const records = await MigrationRecord.find({
    batchId: batch._id,
    tenantId: batch.tenantId,
    $or: [
      { status: "valid" },
      { status: "duplicate", duplicateAction: { $in: ["update", "create"] } }
    ]
  }).limit(limit);
  records.sort((a, b) => {
    const aPriority = ENTITY_MIGRATION_PRIORITY[a.entityType] ?? 999;
    const bPriority = ENTITY_MIGRATION_PRIORITY[b.entityType] ?? 999;
    return aPriority - bPriority;
  });

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

    for (const rec of jobRecords) {
      if (rec.duplicateAction === "skip") {
        migrationRecordUpdates.push({ updateOne: { filter: { _id: rec._id }, update: { $set: { status: "migrated" } } } });
        processed++;
        continue;
      }
      
      const canonical = toCanonicalRecord(schema, rec.sourceData, job.mapping as Record<string, string>);
      
      try {
        const importContext = {
          tenantId: batch.tenantId, 
          userId: batch.createdBy.toString(),
          resolveRef: (entityType: string, sourceId: string) => resolveEntityReference(batch.tenantId, batch._id.toString(), entityType, sourceId)
        };
        const transformData = await handler.transform(canonical, importContext);
        
        let docId: any;
        if (rec.duplicateAction === "update" && rec.duplicateTargetId) {
          docId = rec.duplicateTargetId;
          bulkOps.push({ updateOne: { filter: { _id: docId }, update: { $set: transformData } } });
        } else {
          if (handler.createOperation) {
            docId = transformData._id || new mongoose.Types.ObjectId();
            if (!transformData._id) transformData._id = docId;
            bulkOps.push(handler.createOperation(transformData, canonical, importContext));
          } else {
            docId = new mongoose.Types.ObjectId();
            transformData._id = docId;
            bulkOps.push({ insertOne: { document: transformData } });
          }
        }
        bulkRecordIds.push(rec._id);
        
        migrationRecordUpdates.push({ updateOne: { filter: { _id: rec._id }, update: { $set: { status: "migrated", targetRecordId: docId } } } });
        job.importedRefs.push({ model: handler.modelName, id: docId });

        for (const sourceId of identitySourceIds(job.entityType, canonical)) {
          identityMapInserts.push({
            updateOne: {
              filter: { tenantId: batch.tenantId, batchId: batch._id, entityType: job.entityType, sourceId },
              update: { $set: { targetId: docId } },
              upsert: true,
            }
          });
        }
      } catch (err: any) {
        migrationRecordUpdates.push({ updateOne: { filter: { _id: rec._id }, update: { $set: { status: "failed", errors: [{ message: err.message }] } } } });
      }
      processed++;
    }
    
    if (bulkOps.length > 0) {
      try {
        await handler.model.bulkWrite(bulkOps, { ordered: false });
      } catch (err: any) {
        if (err.writeErrors) {
          for (const writeError of err.writeErrors) {
            const index = writeError.index;
            const recId = bulkRecordIds[index];
            const updateObj = migrationRecordUpdates.find(u => u.updateOne.filter._id === recId);
            if (updateObj) {
              updateObj.updateOne.update = { $set: { status: "failed", errors: [{ message: writeError.errmsg || "Database error" }] } };
            }
          }
        } else {
          console.error("BulkWrite error:", err);
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
  }

  const migratedCount = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "migrated" });
  const failedCount = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "failed" });
  const total = batch.totalRecords || 1;
  batch.progress = Math.min(100, Math.floor(((migratedCount + failedCount) / total) * 100));
  await batch.save();

  const remainingCount = await MigrationRecord.countDocuments({
    batchId: batch._id,
    tenantId: batch.tenantId,
    $or: [
      { status: "valid" },
      { status: "duplicate", duplicateAction: { $in: ["update", "create"] } },
    ],
  });
  if (remainingCount === 0) {
    await finalizeMigrationBatch(batch);
    return { done: true, processed };
  }

  return { done: false, processed };
}

async function finalizeMigrationBatch(batch: any) {
  batch.status = "verifying";
  await batch.save();

  await runPostMigrationVerification(batch);

  const migrated = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "migrated" });
  const failed = await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: batch.tenantId, status: "failed" });
  batch.summary = { ...batch.summary, migrated, failed };
  batch.progress = 100;
  batch.workerLock = null;
  batch.workerHeartbeat = null;
  await batch.save();
}

export async function markBatchFailed(batchId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Migration worker failed.";
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
    const skippedCount = await MigrationRecord.countDocuments({ jobId: job._id, tenantId: batch.tenantId, status: "migrated", duplicateAction: "skip" });
    const validMigrated = await MigrationRecord.find({ jobId: job._id, tenantId: batch.tenantId, status: "migrated", targetRecordId: { $exists: true } }).select("targetRecordId");
    
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

    const expectedTarget = sourceCount - failedCount - skippedCount;
    let passed = targetCount === expectedTarget;
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
      targetCount,
      orphanCount,
      status: passed ? "PASS" : "FAIL"
    });
    
    if (!passed) verification.status = "FAIL";
  }

  batch.summary = { ...batch.summary, verification };
  batch.status = verification.status === "PASS" ? "verified" : "completed";
}

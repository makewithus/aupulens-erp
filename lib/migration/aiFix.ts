import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import { toCanonicalRecord } from "@/lib/migration/validation";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";

function sourceColumnFor(mapping: Record<string, string>, field: string) {
  return mapping[field];
}

function setMappedSource(sourceData: Record<string, unknown>, mapping: Record<string, string>, field: string, value: unknown) {
  const column = sourceColumnFor(mapping, field);
  if (column) sourceData[column] = value;
}

function cleanNumber(value: unknown, fallback: number) {
  const text = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function deterministicRepair(entityType: string, sourceData: Record<string, unknown>, mapping: Record<string, string>, recordId: string) {
  const schema = getEntitySchema(entityType);
  if (!schema) return sourceData;

  const repaired = { ...sourceData };
  const canonical = toCanonicalRecord(schema, repaired, mapping);
  const fallbackId = recordId.slice(-6).toUpperCase();

  if (entityType === MIGRATION_ENTITY.EMPLOYEE) {
    const employeeId = canonical.employeeId || canonical.sourceId || `EMP-MIG-${fallbackId}`;
    const nameFromEmail = canonical.email?.split("@")[0]?.replace(/[._-]+/g, " ");
    if (!canonical.employeeId) setMappedSource(repaired, mapping, "employeeId", employeeId);
    if (!canonical.firstName) setMappedSource(repaired, mapping, "firstName", nameFromEmail || `Imported Employee ${fallbackId}`);
    if (!canonical.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(canonical.email)) {
      setMappedSource(repaired, mapping, "email", `${employeeId.toLowerCase()}@migration.local`);
    }
    if (!canonical.phone) setMappedSource(repaired, mapping, "phone", "0000000000");
    if (!canonical.joiningDate) setMappedSource(repaired, mapping, "joiningDate", new Date().toISOString().slice(0, 10));
    if (!canonical.status) setMappedSource(repaired, mapping, "status", "Active");
  }

  if (entityType === MIGRATION_ENTITY.PRODUCT) {
    const sku = canonical.sku || canonical.sourceId || `PRD-MIG-${fallbackId}`;
    if (!canonical.sourceId) setMappedSource(repaired, mapping, "sourceId", sku);
    if (!canonical.sku) setMappedSource(repaired, mapping, "sku", sku);
    if (!canonical.name) setMappedSource(repaired, mapping, "name", `Imported Product ${sku}`);
    if (canonical.salesPrice) setMappedSource(repaired, mapping, "salesPrice", cleanNumber(canonical.salesPrice, 1));
    if (canonical.stockQuantity) setMappedSource(repaired, mapping, "stockQuantity", cleanNumber(canonical.stockQuantity, 0));
    if (!canonical.status) setMappedSource(repaired, mapping, "status", "Active");
  }

  for (const field of schema.fields) {
    const value = toCanonicalRecord(schema, repaired, mapping)[field.key];
    if (!field.required || value) continue;
    if (field.validate === "number") setMappedSource(repaired, mapping, field.key, 0);
    else setMappedSource(repaired, mapping, field.key, `Imported ${field.label} ${fallbackId}`);
  }

  return repaired;
}

async function aiRepair(
  tenantId: string,
  record: any,
  job: any,
  sourceData: Record<string, unknown>,
): Promise<{ sourceData: Record<string, unknown>; aiUsed: boolean }> {
  const schema = getEntitySchema(record.entityType);
  if (!schema) return { sourceData, aiUsed: false };

  try {
    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const prompt = `Fix this ERP migration row so it can pass validation.

Entity: ${record.entityType}
Allowed source columns: ${JSON.stringify(Object.keys(sourceData))}
Target mapping: ${JSON.stringify(job.mapping || {})}
Target fields: ${JSON.stringify(schema.fields.map((field) => ({ key: field.key, label: field.label, required: field.required, validate: field.validate })))}
Current source row: ${JSON.stringify(sourceData)}
Errors: ${JSON.stringify(record.errors || [])}

Return ONLY a JSON object containing corrected values for the same source column names. Do not include unmapped target field keys. Do not include markdown.`;

    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, {
      systemPrompt: "You repair ERP migration spreadsheet rows. Return raw JSON only. Use only existing source column names.",
      maxTokens: 700,
      feature: "data_migration",
    });
    if (!("text" in result)) return { sourceData, aiUsed: false };

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { sourceData, aiUsed: false };
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const allowed = new Set(Object.keys(sourceData));
    const repaired = { ...sourceData };
    for (const [key, value] of Object.entries(parsed)) {
      if (allowed.has(key)) repaired[key] = value;
    }
    return { sourceData: repaired, aiUsed: true };
  } catch {
    return { sourceData, aiUsed: false };
  }
}

export async function fixMigrationRecordWithAi(batchId: string, tenantId: string, recordId: string) {
  const record = await MigrationRecord.findOne({ _id: recordId, batchId, tenantId });
  if (!record) return { fixed: false, aiUsed: false, message: "Record not found." };

  const [batch, job] = await Promise.all([
    MigrationBatch.findOne({ _id: batchId, tenantId }),
    MigrationJob.findOne({ _id: record.jobId, batchId, tenantId }),
  ]);
  if (!batch || !job) return { fixed: false, aiUsed: false, message: "Migration job not found." };

  const mapping = (job.mapping || {}) as Record<string, string>;
  const sourceData = { ...(record.sourceData || {}) };
  const aiResult = await aiRepair(tenantId, record, job, sourceData);
  const repaired = deterministicRepair(record.entityType, aiResult.sourceData, mapping, record._id.toString());

  record.sourceData = repaired;
  record.status = "pending";
  record.errors = [] as any;
  record.warnings = [] as any;
  record.duplicateAction = undefined;
  record.duplicateTargetId = undefined;
  record.duplicateReason = undefined;
  record.duplicateFields = [];
  await record.save();

  batch.status = "validating";
  batch.progress = 0;
  await batch.save();

  return { fixed: true, aiUsed: aiResult.aiUsed, message: aiResult.aiUsed ? "AI fixed the row and queued it for validation." : "Auto-fix applied and queued the row for validation." };
}

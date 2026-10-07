import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { toCanonicalRecord } from "@/lib/migration/validation";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { deterministicMapping } from "@/lib/migration/deterministicMapping";

function sourceColumnFor(mapping: Record<string, string>, field: string) {
  return mapping[field];
}

function setMappedSource(sourceData: Record<string, unknown>, mapping: Record<string, string>, field: string, value: unknown) {
  const column = sourceColumnFor(mapping, field);
  if (column) sourceData[column] = value;
}

function numberFromText(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function mergeDeterministicMapping(entityType: string, sourceData: Record<string, unknown>, mapping: Record<string, string>) {
  const schema = getEntitySchema(entityType);
  if (!schema) return mapping;
  return {
    ...deterministicMapping(schema, Object.keys(sourceData)),
    ...mapping,
  };
}

function jsonStable(value: unknown) {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function hasRevalidatableSystemError(errors: unknown) {
  return Array.isArray(errors)
    && errors.some((error: any) => /Pre-migration write check failed|Product type must be one of|Vendor outbound payment migration|Missing reference: Sales invoice/i.test(String(error?.message || "")));
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function repairDateValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const year = Number(slash[3]);
    const month = Math.min(Math.max(Number(slash[2]), 1), 12);
    const day = Math.min(Math.max(Number(slash[1]), 1), lastDayOfMonth(year, month));
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const dash = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dash) {
    const year = Number(dash[1]);
    const month = Math.min(Math.max(Number(dash[2]), 1), 12);
    const day = Math.min(Math.max(Number(dash[3]), 1), lastDayOfMonth(year, month));
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function deterministicMigrationRepair(entityType: string, sourceData: Record<string, unknown>, mapping: Record<string, string>) {
  const schema = getEntitySchema(entityType);
  if (!schema) return sourceData;

  const repaired = { ...sourceData };

  for (const field of schema.fields) {
    if (field.validate !== "date") continue;
    const current = toCanonicalRecord(schema, repaired, mapping)[field.key];
    if (!current) continue;
    const repairedDate = repairDateValue(current);
    if (repairedDate) setMappedSource(repaired, mapping, field.key, repairedDate);
  }

  if (entityType === "product") {
    const canonical = toCanonicalRecord(schema, repaired, mapping);
    const stock = numberFromText(canonical.stockQuantity);
    const salesPrice = numberFromText(canonical.salesPrice);
    const cost = numberFromText(canonical.cost);
    if (stock !== null && stock < 0) setMappedSource(repaired, mapping, "stockQuantity", 0);
    if (salesPrice !== null && salesPrice < 0) setMappedSource(repaired, mapping, "salesPrice", 0);
    if (cost !== null && cost < 0) setMappedSource(repaired, mapping, "cost", 0);
    
    if (canonical.type) {
      const typeLower = String(canonical.type).toLowerCase().trim();
      const validTypes = ["consu", "service", "combo"];
      if (!validTypes.includes(typeLower)) {
        if (["consumable", "hardware", "accessory", "goods", "item", "equipment", "printing", "product"].includes(typeLower)) {
          setMappedSource(repaired, mapping, "type", "consu");
        } else if (typeLower === "services") {
          setMappedSource(repaired, mapping, "type", "service");
        }
      }
    }
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
      systemPrompt: "You repair ERP migration spreadsheet rows. Return raw JSON only. Use only existing source column names. Do not invent missing references, emails, phone numbers, product SKUs, invoice numbers, or business amounts.",
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

async function aiRepairWithTimeout(
  tenantId: string,
  record: any,
  job: any,
  sourceData: Record<string, unknown>,
) {
  return Promise.race([
    aiRepair(tenantId, record, job, sourceData),
    new Promise<{ sourceData: Record<string, unknown>; aiUsed: boolean }>((resolve) => {
      setTimeout(() => resolve({ sourceData, aiUsed: false }), 6000);
    }),
  ]);
}

export async function fixMigrationRecordWithAi(batchId: string, tenantId: string, recordId: string) {
  const record = await MigrationRecord.findOne({ _id: recordId, batchId, tenantId });
  if (!record) return { fixed: false, aiUsed: false, message: "Record not found." };

  const [batch, job] = await Promise.all([
    MigrationBatch.findOne({ _id: batchId, tenantId }),
    MigrationJob.findOne({ _id: record.jobId, batchId, tenantId }),
  ]);
  if (!batch || !job) return { fixed: false, aiUsed: false, message: "Migration job not found." };

  const sourceData = { ...(record.sourceData || {}) };
  const originalMapping = (job.mapping || {}) as Record<string, string>;
  const mapping = mergeDeterministicMapping(record.entityType, sourceData, originalMapping);
  const mappingChanged = jsonStable(mapping) !== jsonStable(originalMapping);
  const deterministic = deterministicMigrationRepair(record.entityType, sourceData, mapping);
  const deterministicChanged = jsonStable(deterministic) !== jsonStable(sourceData);
  const hasStaleSystemError = hasRevalidatableSystemError(record.errors);
  const aiResult = deterministicChanged
    ? { sourceData: deterministic, aiUsed: false }
    : hasStaleSystemError
      ? { sourceData, aiUsed: false }
      : await aiRepairWithTimeout(tenantId, record, job, sourceData);
  const repaired = deterministicMigrationRepair(record.entityType, aiResult.sourceData, mapping);
  const repairedChanged = jsonStable(repaired) !== jsonStable(sourceData) || mappingChanged;

  if (!repairedChanged && !hasStaleSystemError) {
    return {
      fixed: false,
      aiUsed: aiResult.aiUsed,
      message: "No automatic fix was available for this row. Please edit the highlighted source value.",
    };
  }

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
  batch.progress = 1;
  if (mappingChanged) {
    job.mapping = mapping as any;
    await job.save();
  }
  await batch.save();

  return { fixed: true, aiUsed: aiResult.aiUsed, message: aiResult.aiUsed ? "AI fixed the row and queued it for validation." : "Auto-fix applied and queued the row for validation." };
}

export async function fastFixMigrationRecord(batchId: string, tenantId: string, recordId: string) {
  const record = await MigrationRecord.findOne({ _id: recordId, batchId, tenantId });
  if (!record) return { fixed: false, changed: false, message: "Record not found." };

  const [batch, job] = await Promise.all([
    MigrationBatch.findOne({ _id: batchId, tenantId }),
    MigrationJob.findOne({ _id: record.jobId, batchId, tenantId }),
  ]);
  if (!batch || !job) return { fixed: false, changed: false, message: "Migration job not found." };

  const sourceData = { ...(record.sourceData || {}) };
  const originalMapping = (job.mapping || {}) as Record<string, string>;
  const mapping = mergeDeterministicMapping(record.entityType, sourceData, originalMapping);
  const repaired = deterministicMigrationRepair(record.entityType, sourceData, mapping);
  const changed = jsonStable(repaired) !== jsonStable(sourceData) || jsonStable(mapping) !== jsonStable(originalMapping);
  const hasStaleSystemError = hasRevalidatableSystemError(record.errors);
  if (!changed && !hasStaleSystemError) return { fixed: false, changed: false, message: "No automatic repair was available for this row." };

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
  batch.progress = 1;
  job.mapping = mapping as any;
  await job.save();
  await batch.save();

  return { fixed: true, changed, message: changed ? "Auto-fix applied and queued the row for validation." : "Row queued for revalidation." };
}

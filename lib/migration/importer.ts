/**
 * Importer — the only place that writes to live collections.
 *
 * A per-entity registry maps a canonical record ({fieldKey: value}) to a real
 * Mongoose document, declares which model it targets and how to detect an
 * existing duplicate in the DB. `previewImport` is a pure dry-run (validate +
 * transform + count, zero writes); `executeImport` creates the documents and
 * records each created _id on the job so `rollbackImport` can delete exactly
 * what this job added — nothing else.
 */

import mongoose from "mongoose";
import Customer from "@/models/sales/Customer";
import Vendor from "@/models/admin/Vendor";
import Product from "@/models/inventory/Product";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import {
  toCanonicalRecord,
  dedupeSignature,
} from "@/lib/migration/validation";

function num(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

interface EntityHandler {
  modelName: string;
  model: mongoose.Model<any>;
  /** Build the document to insert from a canonical record. */
  transform: (rec: Record<string, string>, ctx: ImportContext) => Record<string, unknown>;
  /** Mongo filter that finds an existing duplicate of this record, or null. */
  existingFilter: (rec: Record<string, string>, tenantId: string) => Record<string, unknown> | null;
}

export interface ImportContext {
  tenantId: string;
  userId: string;
}

const HANDLERS: Record<string, EntityHandler> = {
  [MIGRATION_ENTITY.CUSTOMER]: {
    modelName: "Customer",
    model: Customer,
    transform: (rec, ctx) => ({
      tenantId: ctx.tenantId,
      createdBy: new mongoose.Types.ObjectId(ctx.userId),
      header: {
        name: rec.name,
        displayName: rec.displayName || rec.name,
      },
      contact_details: {
        email: rec.email || undefined,
        phone: rec.phone || undefined,
        mobile: rec.mobile || undefined,
      },
      gstin: rec.gstin ? rec.gstin.toUpperCase() : undefined,
      pan: rec.pan || undefined,
      openingBalance: num(rec.openingBalance) ?? 0,
      addresses:
        rec.street || rec.city || rec.stateName || rec.zip
          ? [
              {
                type: "billing",
                street: rec.street || undefined,
                street2: rec.street2 || undefined,
                city: rec.city || undefined,
                state_name: rec.stateName || undefined,
                zip: rec.zip || undefined,
              },
            ]
          : [],
    }),
    existingFilter: (rec, tenantId) => {
      if (rec.gstin) return { tenantId, gstin: rec.gstin.toUpperCase() };
      if (rec.email) return { tenantId, "contact_details.email": rec.email.toLowerCase() };
      if (rec.name) return { tenantId, "header.name": rec.name };
      return null;
    },
  },

  [MIGRATION_ENTITY.VENDOR]: {
    modelName: "Vendor",
    model: Vendor,
    transform: (rec, ctx) => ({
      tenantId: ctx.tenantId,
      name: rec.name,
      category: rec.category || "General",
      contactEmail: rec.contactEmail || undefined,
      phone: rec.phone || undefined,
      gstin: rec.gstin ? rec.gstin.toUpperCase() : undefined,
      address: rec.address || undefined,
    }),
    existingFilter: (rec, tenantId) => {
      if (rec.gstin) return { tenantId, gstin: rec.gstin.toUpperCase() };
      if (rec.contactEmail) return { tenantId, contactEmail: rec.contactEmail };
      if (rec.name) return { tenantId, name: rec.name };
      return null;
    },
  },

  [MIGRATION_ENTITY.PRODUCT]: {
    modelName: "Product",
    model: Product,
    transform: (rec, ctx) => {
      const type = ["consu", "service", "combo"].includes(rec.type?.toLowerCase())
        ? rec.type.toLowerCase()
        : "consu";
      return {
        tenantId: ctx.tenantId,
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
        tab_general_information: {
          name: rec.name,
          type,
          default_code: rec.sku || undefined,
          list_price: num(rec.salesPrice) ?? 1,
          standard_price: num(rec.cost) ?? 0,
          description: rec.description || undefined,
        },
      };
    },
    existingFilter: (rec, tenantId) => {
      if (rec.sku) return { tenantId, "tab_general_information.default_code": rec.sku };
      if (rec.name) return { tenantId, "tab_general_information.name": rec.name };
      return null;
    },
  },
};

export function getHandler(entity: string): EntityHandler | null {
  return HANDLERS[entity] ?? null;
}

export interface PreviewResult {
  willCreate: number;
  willSkip: number;
  sample: Record<string, unknown>[];
}

/**
 * Dry run: transforms every row and counts how many would be created vs skipped
 * (skip = missing required value OR already exists in the DB). No writes.
 */
export async function previewImport(
  entity: string,
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  ctx: ImportContext,
): Promise<PreviewResult> {
  const schema = getEntitySchema(entity);
  const handler = getHandler(entity);
  if (!schema || !handler) return { willCreate: 0, willSkip: rows.length, sample: [] };

  let willCreate = 0;
  let willSkip = 0;
  const sample: Record<string, unknown>[] = [];
  const seenSigs = new Set<string>();

  for (const row of rows) {
    const rec = toCanonicalRecord(schema, row, mapping);
    const missingRequired = schema.fields.some((f) => f.required && !rec[f.key]);

    // In-file duplicate within this preview pass.
    const sig = dedupeSignature(schema, rec);
    const inFileDup = sig ? seenSigs.has(sig) : false;
    if (sig) seenSigs.add(sig);

    const filter = handler.existingFilter(rec, ctx.tenantId);
    const existing = filter ? await handler.model.exists(filter) : null;

    if (missingRequired || inFileDup || existing) {
      willSkip += 1;
    } else {
      willCreate += 1;
      if (sample.length < 5) sample.push(handler.transform(rec, ctx));
    }
  }

  return { willCreate, willSkip, sample };
}

export interface ExecuteResult {
  created: number;
  failed: number;
  errors: { rowIndex: number; message: string }[];
  importedRefs: { model: string; id: mongoose.Types.ObjectId }[];
}

/**
 * Live import. Same skip rules as preview, then `.create()` per surviving row
 * (create() so model pre-save hooks — e.g. Customer's legacy-field sync — fire).
 * Every created _id is captured for rollback.
 */
export async function executeImport(
  entity: string,
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  ctx: ImportContext,
): Promise<ExecuteResult> {
  const schema = getEntitySchema(entity);
  const handler = getHandler(entity);
  if (!schema || !handler) {
    return { created: 0, failed: rows.length, errors: [{ rowIndex: -1, message: "Unknown entity" }], importedRefs: [] };
  }

  const errors: { rowIndex: number; message: string }[] = [];
  const importedRefs: { model: string; id: mongoose.Types.ObjectId }[] = [];
  let created = 0;
  let failed = 0;
  const seenSigs = new Set<string>();

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const rec = toCanonicalRecord(schema, rows[rowIndex], mapping);

    if (schema.fields.some((f) => f.required && !rec[f.key])) {
      failed += 1;
      errors.push({ rowIndex, message: "Skipped: missing required field." });
      continue;
    }

    const sig = dedupeSignature(schema, rec);
    if (sig && seenSigs.has(sig)) {
      failed += 1;
      errors.push({ rowIndex, message: "Skipped: duplicate within file." });
      continue;
    }
    if (sig) seenSigs.add(sig);

    const filter = handler.existingFilter(rec, ctx.tenantId);
    if (filter && (await handler.model.exists(filter))) {
      failed += 1;
      errors.push({ rowIndex, message: "Skipped: already exists in workspace." });
      continue;
    }

    try {
      const doc = await handler.model.create(handler.transform(rec, ctx));
      created += 1;
      importedRefs.push({ model: handler.modelName, id: doc._id });
    } catch (err: unknown) {
      failed += 1;
      errors.push({ rowIndex, message: err instanceof Error ? err.message : "Create failed" });
    }
  }

  return { created, failed, errors, importedRefs };
}

/**
 * Undo an import: delete exactly the records this job created, scoped to the
 * job's tenant as a defense-in-depth guard so a job can never delete another
 * tenant's data even if its refs were tampered with.
 */
export async function rollbackImport(
  importedRefs: { model: string; id: mongoose.Types.ObjectId | string }[],
  tenantId: string,
): Promise<{ deleted: number }> {
  let deleted = 0;
  const byModel = new Map<string, (mongoose.Types.ObjectId | string)[]>();
  for (const ref of importedRefs) {
    if (!byModel.has(ref.model)) byModel.set(ref.model, []);
    byModel.get(ref.model)!.push(ref.id);
  }
  for (const [modelName, ids] of byModel) {
    const model = mongoose.models[modelName];
    if (!model) continue;
    const res = await model.deleteMany({ _id: { $in: ids }, tenantId });
    deleted += res.deletedCount ?? 0;
  }
  return { deleted };
}

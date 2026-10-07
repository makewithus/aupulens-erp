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
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Invoice from "@/models/finance/Invoice";
import Payment from "@/models/sales/Payment";
import Expense from "@/models/finance/Expense";
import Account from "@/models/finance/Account";
import Employee from "@/models/hr/Employee";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import { ENTITY_STATUS, PRODUCT_STATUS } from "@/lib/constants/statuses";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import {
  toCanonicalRecord,
  dedupeSignature,
} from "@/lib/migration/validation";
import { ensureDepartmentForTenant } from "@/lib/migration/employeeDepartmentSync";

function num(v: string): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/,/g, ""));
  return Number.isNaN(n) ? undefined : n;
}

function statusFromText(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["active", "published", "enabled"].includes(normalized)) return "published";
  if (["inactive", "draft", "disabled"].includes(normalized)) return "draft";
  return fallback;
}

function entityStatusFromText(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return ENTITY_STATUS.ACTIVE;
  if (["inactive", "disabled"].includes(normalized)) return ENTITY_STATUS.INACTIVE;
  return ENTITY_STATUS.ACTIVE;
}

function splitName(firstName: string, lastName: string): { firstName: string; lastName: string } {
  if (lastName || !firstName.includes(" ")) {
    return { firstName, lastName: lastName || "-" };
  }
  const parts = firstName.trim().split(/\s+/);
  return {
    firstName: parts.shift() || firstName,
    lastName: parts.join(" ") || "-",
  };
}

async function ensurePlaceholderCustomer(
  tenantId: string,
  userId: string,
  externalId: string,
): Promise<mongoose.Types.ObjectId> {
  const name = `Imported Customer ${externalId}`;
  const existing = await Customer.findOne({
    tenantId,
    $or: [
      { "header.name": externalId },
      { "header.name": name },
    ],
  }).select("_id").lean();
  if (existing?._id) return existing._id as mongoose.Types.ObjectId;

  const created = await Customer.create({
    tenantId,
    createdBy: new mongoose.Types.ObjectId(userId),
    header: {
      name,
      displayName: name,
      is_company: true,
    },
    contact_details: {},
    address_tab: { type: "contact" },
    sales_purchase_tab: {},
    accounting_tab: {},
    customFields: { migrationExternalId: externalId },
    remarks: `Created automatically during migration because legacy reference "${externalId}" was not present in the customer master export.`,
    isActive: true,
  });
  return created._id;
}

async function ensurePlaceholderVendor(
  tenantId: string,
  externalId: string,
): Promise<mongoose.Types.ObjectId> {
  const name = `Imported Vendor ${externalId}`;
  const existing = await Vendor.findOne({
    tenantId,
    $or: [
      { name: externalId },
      { name },
    ],
  }).select("_id").lean();
  if (existing?._id) return existing._id as mongoose.Types.ObjectId;

  const created = await Vendor.create({
    tenantId,
    name,
    category: "Imported",
  });
  return created._id;
}

interface EntityHandler {
  modelName: string;
  model: mongoose.Model<any>;
  /** Build the document to insert from a canonical record. */
  transform: (rec: Record<string, string>, ctx: ImportContext) => Promise<Record<string, unknown>>;
  /** Mongo filter that finds an existing duplicate of this record, or null. */
  existingFilter: (rec: Record<string, string>, tenantId: string) => Record<string, unknown> | null;
  /** Mongo filter for target unique indexes that would make force-create fail. */
  uniqueConflictFilter?: (rec: Record<string, string>, tenantId: string) => { filter: Record<string, unknown>; fields: string[] } | null;
  /** Custom action instead of create (e.g. update an embedded document). If undefined, uses standard insertOne. */
  createOperation?: (doc: Record<string, unknown>, rec: Record<string, string>, ctx: ImportContext) => any;
}

export interface ImportContext {
  tenantId: string;
  userId: string;
  resolveRef: (entityType: string, sourceId: string) => Promise<mongoose.Types.ObjectId | null>;
}

const HANDLERS: Record<string, EntityHandler> = {
  [MIGRATION_ENTITY.CUSTOMER]: {
    modelName: "Customer",
    model: Customer,
    transform: async (rec, ctx) => ({
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
      isActive: entityStatusFromText(rec.status) === ENTITY_STATUS.ACTIVE,
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
    transform: async (rec, ctx) => ({
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
    transform: async (rec, ctx) => {
      const type = ["consu", "service", "combo"].includes(rec.type?.toLowerCase())
        ? rec.type.toLowerCase()
        : "consu";
      const descriptionParts = [
        rec.description,
        rec.category ? `Category: ${rec.category}` : "",
        rec.subcategory ? `Subcategory: ${rec.subcategory}` : "",
        rec.brand ? `Brand: ${rec.brand}` : "",
        rec.stockQuantity ? `Opening stock: ${rec.stockQuantity}` : "",
      ].filter(Boolean);
      return {
        tenantId: ctx.tenantId,
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
        header: {
          name: rec.name,
          sale_ok: true,
          purchase_ok: true,
          can_be_expensed: false,
        },
        tab_general_information: {
          type,
          default_code: rec.sku || undefined,
          list_price: num(rec.salesPrice) ?? 1,
          standard_price: num(rec.cost) ?? 0,
          description: descriptionParts.length ? descriptionParts.join("\n") : undefined,
        },
        status: statusFromText(rec.status, PRODUCT_STATUS.PUBLISHED),
      };
    },
    existingFilter: (rec, tenantId) => {
      if (rec.sku) return { tenantId, "tab_general_information.default_code": rec.sku };
      if (rec.name) return { tenantId, "header.name": rec.name };
      return null;
    },
    uniqueConflictFilter: (rec, tenantId) => {
      if (rec.sku) return { filter: { tenantId, "tab_general_information.default_code": rec.sku }, fields: ["sku"] };
      if (rec.name) return { filter: { tenantId, "header.name": rec.name }, fields: ["name"] };
      return null;
    },
  },

  [MIGRATION_ENTITY.SALES_INVOICE]: {
    modelName: "SalesInvoice",
    model: SalesInvoice,
    transform: async (rec, ctx) => {
      const customerId = await ctx.resolveRef(MIGRATION_ENTITY.CUSTOMER, rec.customerName)
        || await ensurePlaceholderCustomer(ctx.tenantId, ctx.userId, rec.customerName);
      return {
        tenantId: ctx.tenantId,
        number: rec.number,
        customerId,
      invoiceDate: rec.invoiceDate ? new Date(rec.invoiceDate) : new Date(),
      totalAmount: num(rec.totalAmount) ?? 0,
      taxableAmount: num(rec.totalAmount) ?? 0,
      lineItems: [],
      taxes: { tds: 0, tcs: 0, gstBreakup: [] },
        status: "draft",
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
      };
    },
    existingFilter: (rec, tenantId) => {
      if (rec.number) return { tenantId, number: rec.number };
      return null;
    },
    uniqueConflictFilter: (rec, tenantId) => {
      if (rec.number) return { filter: { tenantId, number: rec.number }, fields: ["number"] };
      return null;
    },
  },

  [MIGRATION_ENTITY.INVOICE_ITEM]: {
    modelName: "SalesInvoice",
    model: SalesInvoice,
    transform: async (rec, ctx) => {
      const invoiceId = await ctx.resolveRef(MIGRATION_ENTITY.SALES_INVOICE, rec.invoiceSourceId);
      if (!invoiceId) throw new Error(`Missing reference: Invoice '${rec.invoiceSourceId}' not found`);
      
      let productId = null;
      if (rec.productSourceId) {
        productId = await ctx.resolveRef(MIGRATION_ENTITY.PRODUCT, rec.productSourceId);
      }

      return {
        _id: invoiceId, // Store parent ID here for createOperation to use
        name: rec.productName || rec.productSourceId || "Imported line item",
        itemId: productId || undefined,
        qty: num(rec.qty) ?? 1,
        unitPrice: num(rec.unitPrice) ?? 0,
        lineTotal: num(rec.lineTotal) ?? 0,
        discount: num(rec.discount) ?? 0,
        discountMode: "percent",
        taxRate: num(rec.taxRate) ?? 0,
        hsn: rec.hsn || undefined,
      };
    },
    existingFilter: () => null, // Items are deduplicated during parsing/validation, we just push them
    createOperation: (doc) => {
      const invoiceId = doc._id;
      delete doc._id;
      return {
        updateOne: {
          filter: { _id: invoiceId },
          update: { $push: { lineItems: doc } }
        }
      };
    }
  },

  [MIGRATION_ENTITY.PURCHASE_INVOICE]: {
    modelName: "Invoice",
    model: Invoice,
    transform: async (rec, ctx) => {
      const vendorId = await ctx.resolveRef(MIGRATION_ENTITY.VENDOR, rec.vendorName)
        || await ensurePlaceholderVendor(ctx.tenantId, rec.vendorName);
      return {
        tenantId: ctx.tenantId,
        name: rec.number,
        moveType: "in_invoice",
        partnerId: vendorId,
        invoiceDate: rec.invoiceDate ? new Date(rec.invoiceDate) : new Date(),
        amountTotal: num(rec.totalAmount) ?? 0,
        amountUntaxed: num(rec.totalAmount) ?? 0,
        invoiceLines: [],
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
      };
    },
    existingFilter: (rec, tenantId) => {
      if (rec.number) return { tenantId, name: rec.number, moveType: "in_invoice" };
      return null;
    },
    uniqueConflictFilter: (rec, tenantId) => {
      if (rec.number) return { filter: { tenantId, name: rec.number }, fields: ["number"] };
      return null;
    },
  },

  [MIGRATION_ENTITY.PAYMENT]: {
    modelName: "Payment",
    model: Payment,
    transform: async (rec, ctx) => {
      const type = rec.type?.trim().toLowerCase();
      const isReceipt = !type || ["receipt", "customer receipt", "inbound", "inbound receipt", "cleared", "paid", "posted", "received", "reconciled"].includes(type);
      if (!isReceipt) {
        throw new Error("Vendor outbound payment migration is not supported by the current target payment model.");
      }
      const customerId = await ctx.resolveRef(MIGRATION_ENTITY.CUSTOMER, rec.partyName)
        || await ensurePlaceholderCustomer(ctx.tenantId, ctx.userId, rec.partyName);
      const amount = num(rec.amount) ?? 0;

      return {
        tenantId: ctx.tenantId,
        customerId,
        paymentNumber: rec.reference || `MIG-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
        paymentDate: rec.date ? new Date(rec.date) : new Date(),
        amountReceived: amount,
        bankCharges: 0,
        mode: "Cash",
        reference: rec.reference || undefined,
        taxDeducted: false,
        tdsAmount: 0,
        allocations: [],
        unusedAmount: amount,
        journalEntryIds: [],
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
      };
    },
    existingFilter: (rec, tenantId) => {
      if (rec.reference) return { tenantId, paymentNumber: rec.reference };
      return null;
    },
    uniqueConflictFilter: (rec, tenantId) => {
      if (rec.reference) return { filter: { tenantId, paymentNumber: rec.reference }, fields: ["reference"] };
      return null;
    },
  },

  [MIGRATION_ENTITY.EXPENSE]: {
    modelName: "Expense",
    model: Expense,
    transform: async (rec, ctx) => {
      const expenseAccountId = await ctx.resolveRef(MIGRATION_ENTITY.ACCOUNT, rec.expenseAccount);
      if (!expenseAccountId) throw new Error(`Missing reference: Account '${rec.expenseAccount}' not found`);
      
      return {
        tenantId: ctx.tenantId,
        date: rec.date ? new Date(rec.date) : new Date(),
        amount: num(rec.amount) ?? 0,
        reference: rec.reference || undefined,
        description: rec.expenseAccount,
        categoryId: expenseAccountId,
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
      };
    },
    existingFilter: (rec, tenantId) => {
      if (rec.reference) return { tenantId, reference: rec.reference };
      return null;
    },
  },

  [MIGRATION_ENTITY.ACCOUNT]: {
    modelName: "Account",
    model: Account,
    transform: async (rec, ctx) => ({
      tenantId: ctx.tenantId,
      accountName: rec.accountName,
      accountCode: rec.accountCode || undefined,
      internal_group: rec.accountType || undefined,
      createdBy: new mongoose.Types.ObjectId(ctx.userId),
    }),
    existingFilter: (rec, tenantId) => {
      if (rec.accountName) return { tenantId, accountName: rec.accountName };
      if (rec.accountCode) return { tenantId, accountCode: rec.accountCode };
      return null;
    },
    uniqueConflictFilter: (rec, tenantId) => {
      const clauses = [];
      const fields = [];
      if (rec.accountName) {
        clauses.push({ accountName: rec.accountName });
        fields.push("accountName");
      }
      if (rec.accountCode) {
        clauses.push({ accountCode: rec.accountCode });
        fields.push("accountCode");
      }
      return clauses.length ? { filter: { tenantId, $or: clauses }, fields } : null;
    },
  },

  [MIGRATION_ENTITY.EMPLOYEE]: {
    modelName: "Employee",
    model: Employee,
    transform: async (rec, ctx) => {
      const name = splitName(rec.firstName, rec.lastName);
      const departmentId = await ensureDepartmentForTenant(ctx.tenantId, rec.department, ctx.userId);
      return {
        tenantId: ctx.tenantId,
        createdBy: new mongoose.Types.ObjectId(ctx.userId),
        firstName: name.firstName,
        lastName: name.lastName,
        email: rec.email || `${rec.employeeId || new mongoose.Types.ObjectId().toString().slice(-8)}@migration.local`,
        phone: rec.phone || "0000000000",
        employeeCode: rec.employeeId || rec.sourceId || `MIG-${new mongoose.Types.ObjectId().toString().slice(-8)}`,
        departmentId,
        designation: rec.designation || undefined,
        dateOfJoining: rec.joiningDate ? new Date(rec.joiningDate) : new Date(),
        employmentType: "full-time",
        lifecycleStatus: "active",
        status: entityStatusFromText(rec.status),
      };
    },
    existingFilter: (rec, tenantId) => {
      const clauses = [];
      if (rec.email) clauses.push({ email: rec.email });
      if (rec.employeeId) clauses.push({ employeeCode: rec.employeeId });
      return clauses.length ? { tenantId, $or: clauses } : null;
    },
    uniqueConflictFilter: (rec, tenantId) => {
      if (rec.employeeId) return { filter: { tenantId, employeeCode: rec.employeeId }, fields: ["employeeId"] };
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
      if (sample.length < 5) sample.push(await handler.transform(rec, ctx));
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
      const doc = await handler.model.create(await handler.transform(rec, ctx));
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

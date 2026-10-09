import mongoose from "mongoose";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import Customer from "@/models/sales/Customer";
import Vendor from "@/models/admin/Vendor";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import SaleOrder from "@/models/sales/SaleOrder";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import Employee from "@/models/hr/Employee";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import MigrationRecord from "@/models/admin/MigrationRecord";

export async function resolveEntityReference(
  tenantId: string,
  batchId: string | mongoose.Types.ObjectId,
  entityType: string,
  sourceId: string,
  cache?: Map<string, any>
): Promise<mongoose.Types.ObjectId | null> {
  if (!sourceId) return null;
  const cacheKey = `ref:${entityType}:${sourceId}`;
  if (cache && cache.has(cacheKey)) return cache.get(cacheKey);

  // 1. Try to find in the identity map from this migration batch
  const mapEntry = await MigrationIdentityMap.findOne({
    tenantId,
    batchId,
    entityType,
    sourceId,
  }).lean();

  if (mapEntry && mapEntry.targetId) {
    if (cache) cache.set(cacheKey, mapEntry.targetId);
    return mapEntry.targetId as mongoose.Types.ObjectId;
  }

  // 2. Try to find an existing record in the live database by its logical unique name/identifier
  switch (entityType) {
    case MIGRATION_ENTITY.CUSTOMER: {
      const doc = await Customer.findOne({ tenantId, "header.name": sourceId }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.VENDOR: {
      const doc = await Vendor.findOne({ tenantId, name: sourceId }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.PRODUCT: {
      const doc = await Product.findOne({
        tenantId,
        $or: [
          { "header.name": sourceId },
          { "tab_general_information.default_code": sourceId },
        ],
      }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.SALES_INVOICE: {
      const doc = await SalesInvoice.findOne({ tenantId, number: sourceId }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.SALES_ORDER: {
      const doc = await SaleOrder.findOne({ tenantId, "header.name": sourceId }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.PURCHASE_INVOICE: {
      const doc = await Invoice.findOne({ tenantId, name: sourceId, moveType: "in_invoice" }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.ACCOUNT: {
      const doc = await Account.findOne({ tenantId, accountName: sourceId }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.EMPLOYEE: {
      // Assuming employee has a name or email
      const doc = await Employee.findOne({ tenantId, $or: [{ name: sourceId }, { email: sourceId }] }).select("_id").lean();
      if (doc && cache) cache.set(cacheKey, doc._id);
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
  }

  if (cache) cache.set(cacheKey, null);
  return null;
}

export async function saveIdentityMap(
  tenantId: string,
  batchId: string | mongoose.Types.ObjectId,
  entityType: string,
  sourceId: string,
  targetId: mongoose.Types.ObjectId
) {
  if (!sourceId) return;
  await MigrationIdentityMap.findOneAndUpdate(
    { tenantId, batchId, entityType, sourceId },
    { targetId },
    { upsert: true, new: true }
  );
}

async function hasWorkspaceReference(
  tenantId: string,
  batchId: string | mongoose.Types.ObjectId,
  entityType: string,
  sourceId: string,
  cache?: Map<string, any>
): Promise<boolean> {
  if (!sourceId) return false;
  const cacheKey = `has:${entityType}:${sourceId}`;
  if (cache && cache.has(cacheKey)) return cache.get(cacheKey);
  const escaped = sourceId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sourceMatcher = new RegExp(`^${escaped}$`, "i");
  const candidates = await MigrationRecord.find({
    tenantId,
    batchId,
    entityType,
    status: { $nin: ["invalid", "failed"] },
    $or: [
      { "mappedData.sourceId": sourceMatcher },
      { "mappedData.name": sourceMatcher },
      { "mappedData.accountName": sourceMatcher },
      { "mappedData.email": sourceMatcher },
      { "mappedData.number": sourceMatcher },
      { "mappedData.sku": sourceMatcher },
      { "sourceData.Name": sourceMatcher },
      { "sourceData.NAME": sourceMatcher },
      { "sourceData.name": sourceMatcher },
      { "sourceData.Customer Name": sourceMatcher },
      { "sourceData.Vendor Name": sourceMatcher },
      { "sourceData.Product Name": sourceMatcher },
      { "sourceData.Item Name": sourceMatcher },
      { "sourceData.SKU": sourceMatcher },
      { "sourceData.Item Code": sourceMatcher },
      { "sourceData.Invoice Number": sourceMatcher },
      { "sourceData.Inv No": sourceMatcher },
      { "sourceData.Ledger Name": sourceMatcher },
      { "sourceData.Account Name": sourceMatcher },
      { "sourceData.Email": sourceMatcher },
      { "sourceData.email": sourceMatcher },
      { "sourceData.Legacy Customer ID": sourceMatcher },
      { "sourceData.Customer Legacy ID": sourceMatcher },
      { "sourceData.Legacy Vendor ID": sourceMatcher },
      { "sourceData.Vendor Legacy ID": sourceMatcher },
      { "sourceData.Legacy Product ID": sourceMatcher },
      { "sourceData.Product Legacy ID": sourceMatcher },
      { "sourceData.Legacy Invoice ID": sourceMatcher },
      { "sourceData.Invoice Legacy ID": sourceMatcher },
      { "sourceData.Legacy Payment ID": sourceMatcher },
      { "sourceData.Payment Legacy ID": sourceMatcher },
      { "sourceData.Legacy Employee ID": sourceMatcher },
      { "sourceData.Employee Legacy ID": sourceMatcher },
    ],
  })
    .select("_id")
    .lean();
  const result = candidates.length > 0;
  if (cache) cache.set(cacheKey, result);
  return result;
}

export async function validateRelationships(
  tenantId: string,
  batchId: string | mongoose.Types.ObjectId,
  entityType: string,
  canonical: Record<string, any>,
  cache?: Map<string, any>
): Promise<{ field: string, message: string }[]> {
  const errors: { field: string, message: string }[] = [];
  
  if (entityType === MIGRATION_ENTITY.SALES_INVOICE) {
    if (canonical.customerName) {
      const ref = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.CUSTOMER, canonical.customerName, cache);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.CUSTOMER, canonical.customerName, cache))) {
        // Legacy ERP exports often contain transactional rows for archived or
        // deleted customers absent from the customer master export. We preserve
        // the invoice by creating a placeholder customer during import.
      }
    }
  } else if (entityType === MIGRATION_ENTITY.SALES_ORDER) {
    if (canonical.customerName) {
      const ref = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.CUSTOMER, canonical.customerName, cache);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.CUSTOMER, canonical.customerName, cache))) {
        // Placeholder customer will be created during import if still missing.
      }
    }
  } else if (entityType === MIGRATION_ENTITY.SALES_ORDER_LINE) {
    if (canonical.orderSourceId) {
      const orderRef = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.SALES_ORDER, canonical.orderSourceId, cache);
      if (!orderRef && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.SALES_ORDER, canonical.orderSourceId, cache))) {
        errors.push({ field: "orderSourceId", message: `Missing reference: Sales order '${canonical.orderSourceId}' not found` });
      }
    }
    if (canonical.productSourceId) {
      const productRef = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.PRODUCT, canonical.productSourceId, cache);
      if (!productRef && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.PRODUCT, canonical.productSourceId, cache))) {
        // Sales order lines can still be preserved with a free-text item name.
      }
    }
  } else if (entityType === MIGRATION_ENTITY.PURCHASE_INVOICE) {
    if (canonical.vendorName) {
      const ref = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.VENDOR, canonical.vendorName, cache);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.VENDOR, canonical.vendorName, cache))) {
        // Placeholder vendor will be created during import if still missing.
      }
    }
  } else if (entityType === MIGRATION_ENTITY.PAYMENT) {
    if (canonical.invoiceSourceId) {
      // Payments are preserved even when the referenced invoice is absent or
      // currently invalid. The importer stores them as unapplied receipts using
      // the invoice/reference as the placeholder customer key, so a legacy
      // workbook with partial invoice history does not block the whole batch.
    } else if (canonical.partyName) {
      const type = canonical.type?.toLowerCase() === "receipt" ? "inbound" : "outbound";
      const partyEntityType = type === "inbound" ? MIGRATION_ENTITY.CUSTOMER : MIGRATION_ENTITY.VENDOR;
      const ref = await resolveEntityReference(tenantId, batchId, partyEntityType, canonical.partyName, cache);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, partyEntityType, canonical.partyName, cache))) {
        // Placeholder party will be created during import if still missing.
      }
    }
  } else if (entityType === MIGRATION_ENTITY.EXPENSE) {
    if (canonical.expenseAccount) {
      const ref = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.ACCOUNT, canonical.expenseAccount, cache);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.ACCOUNT, canonical.expenseAccount, cache))) {
        errors.push({ field: "expenseAccount", message: `Missing reference: Account '${canonical.expenseAccount}' not found` });
      }
    }
  } else if (entityType === MIGRATION_ENTITY.INVOICE_ITEM) {
    if (canonical.invoiceSourceId) {
      const invoiceRef = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.SALES_INVOICE, canonical.invoiceSourceId, cache);
      if (!invoiceRef && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.SALES_INVOICE, canonical.invoiceSourceId, cache))) {
        errors.push({ field: "invoiceSourceId", message: `Missing reference: Sales invoice '${canonical.invoiceSourceId}' not found` });
      }
    }
    if (canonical.productSourceId) {
      const productRef = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.PRODUCT, canonical.productSourceId, cache);
      if (!productRef && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.PRODUCT, canonical.productSourceId, cache))) {
        // Invoice lines can still be preserved with a free-text item name when
        // the referenced product is absent from the product master export.
      }
    }
  }
  
  return errors;
}

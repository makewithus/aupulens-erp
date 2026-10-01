import mongoose from "mongoose";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import Customer from "@/models/sales/Customer";
import Vendor from "@/models/admin/Vendor";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import Employee from "@/models/hr/Employee";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";
import MigrationRecord from "@/models/admin/MigrationRecord";

export async function resolveEntityReference(
  tenantId: string,
  batchId: string | mongoose.Types.ObjectId,
  entityType: string,
  sourceId: string
): Promise<mongoose.Types.ObjectId | null> {
  if (!sourceId) return null;

  // 1. Try to find in the identity map from this migration batch
  const mapEntry = await MigrationIdentityMap.findOne({
    tenantId,
    batchId,
    entityType,
    sourceId,
  }).lean();

  if (mapEntry && mapEntry.targetId) {
    return mapEntry.targetId as mongoose.Types.ObjectId;
  }

  // 2. Try to find an existing record in the live database by its logical unique name/identifier
  switch (entityType) {
    case MIGRATION_ENTITY.CUSTOMER: {
      const doc = await Customer.findOne({ tenantId, "header.name": sourceId }).select("_id").lean();
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.VENDOR: {
      const doc = await Vendor.findOne({ tenantId, name: sourceId }).select("_id").lean();
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
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.SALES_INVOICE: {
      const doc = await SalesInvoice.findOne({ tenantId, number: sourceId }).select("_id").lean();
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.PURCHASE_INVOICE: {
      const doc = await Invoice.findOne({ tenantId, name: sourceId, moveType: "in_invoice" }).select("_id").lean();
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.ACCOUNT: {
      const doc = await Account.findOne({ tenantId, accountName: sourceId }).select("_id").lean();
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
    case MIGRATION_ENTITY.EMPLOYEE: {
      // Assuming employee has a name or email
      const doc = await Employee.findOne({ tenantId, $or: [{ name: sourceId }, { email: sourceId }] }).select("_id").lean();
      return doc ? (doc._id as mongoose.Types.ObjectId) : null;
    }
  }

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
): Promise<boolean> {
  if (!sourceId) return false;
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
    ],
  })
    .select("_id")
    .lean();
  return candidates.length > 0;
}

export async function validateRelationships(
  tenantId: string,
  batchId: string | mongoose.Types.ObjectId,
  entityType: string,
  canonical: Record<string, any>
): Promise<{ field: string, message: string }[]> {
  const errors: { field: string, message: string }[] = [];
  
  if (entityType === MIGRATION_ENTITY.SALES_INVOICE) {
    if (canonical.customerName) {
      const ref = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.CUSTOMER, canonical.customerName);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.CUSTOMER, canonical.customerName))) {
        errors.push({ field: "customerName", message: `Missing reference: Customer '${canonical.customerName}' not found` });
      }
    }
  } else if (entityType === MIGRATION_ENTITY.PURCHASE_INVOICE) {
    if (canonical.vendorName) {
      const ref = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.VENDOR, canonical.vendorName);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.VENDOR, canonical.vendorName))) {
        errors.push({ field: "vendorName", message: `Missing reference: Vendor '${canonical.vendorName}' not found` });
      }
    }
  } else if (entityType === MIGRATION_ENTITY.PAYMENT) {
    if (canonical.partyName) {
      const type = canonical.type?.toLowerCase() === "receipt" ? "inbound" : "outbound";
      const partyEntityType = type === "inbound" ? MIGRATION_ENTITY.CUSTOMER : MIGRATION_ENTITY.VENDOR;
      const ref = await resolveEntityReference(tenantId, batchId, partyEntityType, canonical.partyName);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, partyEntityType, canonical.partyName))) {
        errors.push({ field: "partyName", message: `Missing reference: ${partyEntityType} '${canonical.partyName}' not found` });
      }
    }
  } else if (entityType === MIGRATION_ENTITY.EXPENSE) {
    if (canonical.expenseAccount) {
      const ref = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.ACCOUNT, canonical.expenseAccount);
      if (!ref && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.ACCOUNT, canonical.expenseAccount))) {
        errors.push({ field: "expenseAccount", message: `Missing reference: Account '${canonical.expenseAccount}' not found` });
      }
    }
  } else if (entityType === MIGRATION_ENTITY.INVOICE_ITEM) {
    if (canonical.invoiceSourceId) {
      const invoiceRef = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.SALES_INVOICE, canonical.invoiceSourceId);
      if (!invoiceRef && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.SALES_INVOICE, canonical.invoiceSourceId))) {
        errors.push({ field: "invoiceSourceId", message: `Missing reference: Sales invoice '${canonical.invoiceSourceId}' not found` });
      }
    }
    if (canonical.productSourceId) {
      const productRef = await resolveEntityReference(tenantId, batchId, MIGRATION_ENTITY.PRODUCT, canonical.productSourceId);
      if (!productRef && !(await hasWorkspaceReference(tenantId, batchId, MIGRATION_ENTITY.PRODUCT, canonical.productSourceId))) {
        errors.push({ field: "productSourceId", message: `Missing reference: Product '${canonical.productSourceId}' not found` });
      }
    }
  }
  
  return errors;
}

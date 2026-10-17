import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import fs from "fs";
import * as xlsx from "xlsx";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

process.env.MONGODB_URI = `mongodb://localhost:27017/ns_migration_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Vendor from "@/models/admin/Vendor";
import Invoice from "@/models/finance/Invoice";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import { MIGRATION_ENTITY, MIGRATION_JOB_STATUS } from "@/lib/migration/constants";
import { processMigrationWorker, runWriteReadinessCheck } from "@/lib/migration/worker";
import { prepareMigrationFiles, prepareMigrationPackage } from "@/lib/migration/package";
import { deterministicMapping } from "@/lib/migration/deterministicMapping";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { ensureDepartmentForTenant } from "@/lib/migration/employeeDepartmentSync";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";
import { executeImport, rollbackImport } from "@/lib/migration/importer";
import { getOnHandQuantity } from "@/lib/inventory/stockGuard";
import { buildPostedJournalReport } from "@/lib/accounting/reports";
import { checkJournalAccountDependencies } from "@/lib/migration/dependencyCheck";

const TENANT = "tenant-migration-e2e";
const USER_ID = new mongoose.Types.ObjectId();
const itIfFile = (fileName: string) => fs.existsSync(fileName) ? it : it.skip;

async function runWorkerUntilDone(batchId: string, limit = 2, maxIterations = 100) {
  let result = { done: false, processed: 0 };
  for (let i = 0; i < maxIterations && !result.done; i++) {
    result = await processMigrationWorker(batchId, limit);
  }
  expect(result.done).toBe(true);
}

async function createJobWithRecords(
  batchId: mongoose.Types.ObjectId,
  entityType: string,
  name: string,
  mapping: Record<string, string>,
  rows: Record<string, unknown>[],
) {
  const job = await MigrationJob.create({
    tenantId: TENANT,
    batchId,
    name,
    sourceSystem: "tally",
    entityType,
    status: MIGRATION_JOB_STATUS.MAPPED,
    fileName: name,
    columns: Object.keys(rows[0] ?? {}),
    totalRows: rows.length,
    mapping,
    importedRefs: [],
    createdBy: USER_ID,
  });

  await MigrationRecord.insertMany(
    rows.map((sourceData) => ({
      tenantId: TENANT,
      batchId,
      jobId: job._id,
      entityType,
      sourceData,
      status: "pending",
    })),
  );

  return job;
}

describe("migration worker E2E workflow", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await MigrationBatch.init();
    await MigrationJob.init();
    await MigrationRecord.init();
    await MigrationIdentityMap.init();
    await Customer.init();
    await Product.init();
    await Stock.init();
    await Employee.init();
    await Account.init();
    await JournalEntry.init();
    await Vendor.init();
    await Invoice.init();
    await SalesInvoice.init();
    await Payment.init();
    await MigrationBatch.deleteMany({ tenantId: TENANT });
    await MigrationJob.deleteMany({ tenantId: TENANT });
    await MigrationRecord.deleteMany({ tenantId: TENANT });
    await MigrationIdentityMap.deleteMany({ tenantId: TENANT });
    await Customer.deleteMany({ tenantId: TENANT });
    await Product.deleteMany({ tenantId: TENANT });
    await Stock.deleteMany({ tenantId: TENANT });
    await Employee.deleteMany({ tenantId: TENANT });
    await Account.deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
    await Vendor.deleteMany({ tenantId: TENANT });
    await Invoice.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await Payment.deleteMany({ tenantId: TENANT });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await MigrationBatch.deleteMany({ tenantId: TENANT });
    await MigrationJob.deleteMany({ tenantId: TENANT });
    await MigrationRecord.deleteMany({ tenantId: TENANT });
    await MigrationIdentityMap.deleteMany({ tenantId: TENANT });
    await Customer.deleteMany({ tenantId: TENANT });
    await Product.deleteMany({ tenantId: TENANT });
    await Stock.deleteMany({ tenantId: TENANT });
    await Employee.deleteMany({ tenantId: TENANT });
    await Account.deleteMany({ tenantId: TENANT });
    await JournalEntry.deleteMany({ tenantId: TENANT });
    await Vendor.deleteMany({ tenantId: TENANT });
    await Invoice.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await Payment.deleteMany({ tenantId: TENANT });
  });

  it("imports product opening stock into the stock ledger and rolls it back with the product", async () => {
    const result = await executeImport(
      MIGRATION_ENTITY.PRODUCT,
      [{ Name: "Northstar Router", SKU: "SKU-HW-R", Category: "Hardware", Price: "8500", Qty: "35", Type: "Inventory" }],
      { name: "Name", sku: "SKU", category: "Category", salesPrice: "Price", stockQuantity: "Qty", type: "Type" },
      { tenantId: TENANT, userId: String(USER_ID), resolveRef: async () => null },
    );

    expect(result).toMatchObject({ created: 1, failed: 0 });
    const product = await Product.findOne({ tenantId: TENANT, "tab_general_information.default_code": "SKU-HW-R" }).lean();
    expect(product?.tab_general_information.list_price).toBe(8500);
    const stock = await Stock.findOne({ tenantId: TENANT, product: product?._id }).lean();
    expect(stock).toMatchObject({ quantity: 35, type: "in" });

    const retry = await executeImport(
      MIGRATION_ENTITY.PRODUCT,
      [{ Name: "Northstar Router", SKU: "SKU-HW-R", Category: "Hardware", Price: "8500", Qty: "35", Type: "Inventory" }],
      { name: "Name", sku: "SKU", category: "Category", salesPrice: "Price", stockQuantity: "Qty", type: "Type" },
      { tenantId: TENANT, userId: String(USER_ID), resolveRef: async () => null },
    );
    expect(retry).toMatchObject({ created: 0, failed: 1 });
    expect(await Stock.countDocuments({ tenantId: TENANT, migrationSourceKey: { $exists: true } })).toBe(1);

    expect(await rollbackImport(result.importedRefs, TENANT)).toMatchObject({ deleted: 2 });
    expect(await Product.countDocuments({ tenantId: TENANT, "tab_general_information.default_code": "SKU-HW-R" })).toBe(0);
    expect(await Stock.countDocuments({ tenantId: TENANT, product: product?._id })).toBe(0);
  });

  it("links vendor bills to a displayable supplier accounting partner", async () => {
    const vendor = await Vendor.create({ tenantId: TENANT, name: "DeviceStack", category: "Hardware" });
    const result = await executeImport(
      MIGRATION_ENTITY.PURCHASE_INVOICE,
      [{ Number: "BILL-TEST-1", Vendor: "VEND-001", Date: "2026-03-13", Total: "1000" }],
      { number: "Number", vendorName: "Vendor", invoiceDate: "Date", totalAmount: "Total" },
      {
        tenantId: TENANT,
        userId: String(USER_ID),
        batchId: "vendor-bill-rollback-test",
        resolveRef: async (entity, sourceId) => entity === MIGRATION_ENTITY.VENDOR && sourceId === "VEND-001" ? vendor._id : null,
      },
    );

    expect(result).toMatchObject({ created: 1, failed: 0 });
    const bill = await Invoice.findOne({ tenantId: TENANT, migrationOriginalBillNumber: "BILL-TEST-1", moveType: "in_invoice" })
      .populate({ path: "partnerId", select: "header.name" });
    expect((bill?.partnerId as any)?.header?.name).toBe("DeviceStack");
    expect(String(bill?.vendorId)).toBe(String(vendor._id));
    expect(result.importedRefs.some((ref) => ref.model === "Customer")).toBe(true);
    expect(await rollbackImport(result.importedRefs, TENANT)).toMatchObject({ deleted: 2 });
    expect(await Invoice.countDocuments({ tenantId: TENANT, name: "BILL-TEST-1::VEND-001" })).toBe(0);
    expect(await Customer.countDocuments({ tenantId: TENANT, "customFields.migrationPartnerType": "vendor" })).toBe(0);
  });

  it("keeps data in the workspace until approval, then migrates related invoices, line items, products, and receipts", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "tally",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 5,
      totalRecords: 6,
      totalModules: 5,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.CUSTOMER,
      "customers.csv",
      { sourceId: "Customer ID", name: "Customer Name", email: "Email ID", gstin: "GSTIN" },
      [{ "Customer ID": "CUST-001", "Customer Name": "Acme Industries", "Email ID": "ap@acme.example", GSTIN: "27ABCDE1234F1Z5" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "products.csv",
      { sourceId: "Product ID", name: "Item Name", sku: "SKU", salesPrice: "Rate" },
      [{ "Product ID": "PROD-001", "Item Name": "Precision Lens", SKU: "LENS-001", Rate: "1250.50" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.SALES_INVOICE,
      "sales-invoices.csv",
      { sourceId: "Invoice ID", number: "Invoice Number", customerName: "Customer Name", invoiceDate: "Date", totalAmount: "Total" },
      [{ "Invoice ID": "INV-SRC-001", "Invoice Number": "INV-001", "Customer Name": "Acme Industries", Date: "2026-09-01", Total: "2501.00" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.INVOICE_ITEM,
      "invoice-items.csv",
      { invoiceSourceId: "Invoice Number", productSourceId: "SKU", productName: "Item Name", qty: "Qty", unitPrice: "Rate", lineTotal: "Amount" },
      [
        { "Invoice Number": "INV-001", SKU: "LENS-001", "Item Name": "Precision Lens", Qty: "1", Rate: "1250.50", Amount: "1250.50" },
        { "Invoice Number": "INV-001", SKU: "LENS-001", "Item Name": "Precision Lens", Qty: "1", Rate: "1250.50", Amount: "1250.50" },
      ],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PAYMENT,
      "receipts.csv",
      { sourceId: "Payment ID", type: "Type", partyName: "Customer Name", amount: "Amount", date: "Date", reference: "Receipt No" },
      [{ "Payment ID": "PAY-001", Type: "Receipt", "Customer Name": "Acme Industries", Amount: "2501.00", Date: "2026-09-05", "Receipt No": "RCPT-001" }],
    );

    await runWorkerUntilDone(String(batch._id), 50, 20);

    const previewBatch = await MigrationBatch.findById(batch._id).lean();
    expect(previewBatch?.status).toBe("preview");
    expect(await Customer.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await Product.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await SalesInvoice.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await Payment.countDocuments({ tenantId: TENANT })).toBe(0);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id), 50, 20);

    const finalBatch = await MigrationBatch.findById(batch._id).lean();
    expect(finalBatch?.status).toBe("verified");

    const customer = await Customer.findOne({ tenantId: TENANT, "header.name": "Acme Industries" }).lean();
    expect(customer?._id).toBeTruthy();

    const product = await Product.findOne({ tenantId: TENANT, "tab_general_information.default_code": "LENS-001" }).lean();
    expect(product?.header.name).toBe("Precision Lens");

    const invoice = await SalesInvoice.findOne({ tenantId: TENANT, number: "INV-001" }).lean();
    expect(String(invoice?.customerId)).toBe(String(customer?._id));
    expect(invoice?.lineItems).toHaveLength(2);
    expect(invoice?.lineItems.map((line) => String(line.itemId))).toEqual([String(product?._id), String(product?._id)]);

    const receipt = await Payment.findOne({ tenantId: TENANT, paymentNumber: "PAY-001" }).lean();
    expect(String(receipt?.customerId)).toBe(String(customer?._id));
    expect(receipt?.reference).toBe("RCPT-001");
    expect(receipt?.amountReceived).toBe(2501);
    expect(receipt?.unusedAmount).toBe(2501);

    const productSkuMap = await MigrationIdentityMap.findOne({
      tenantId: TENANT,
      batchId: batch._id,
      entityType: MIGRATION_ENTITY.PRODUCT,
      sourceId: "LENS-001",
    }).lean();
    expect(String(productSkuMap?.targetId)).toBe(String(product?._id));

    const invoiceMap = await MigrationIdentityMap.findOne({
      tenantId: TENANT,
      batchId: batch._id,
      entityType: MIGRATION_ENTITY.SALES_INVOICE,
      sourceId: "INV-001",
    }).lean();
    expect(String(invoiceMap?.targetId)).toBe(String(invoice?._id));
  });

  it("accepts Odoo-style invoice headers whose totals live on invoice lines", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "odoo",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 4,
      totalRecords: 4,
      totalModules: 4,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.CUSTOMER,
      "Odoo.xlsx - Customers",
      { sourceId: "Legacy Customer ID", name: "Customer Name", email: "Email" },
      [{ "Legacy Customer ID": "CUS-34984", "Customer Name": "Northstar Retail Solutions Pvt Ltd", Email: "northstar@legacy.example" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "Odoo.xlsx - Products",
      { sourceId: "Legacy Product ID", name: "Product Name", sku: "SKU", salesPrice: "Unit Price" },
      [{ "Legacy Product ID": "PRD-49087", "Product Name": "NovaBook Business 14", SKU: "NB14-BUS-001", "Unit Price": "68500" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.SALES_INVOICE,
      "Odoo.xlsx - Invoices",
      { sourceId: "Legacy Invoice ID", number: "Legacy Invoice ID", customerName: "Customer Legacy ID", invoiceDate: "Invoice Date" },
      [{ "Legacy Invoice ID": "INV-65332", "Invoice Date": "2026-01-09", "Customer Legacy ID": "CUS-34984", "Invoice Status": "Posted" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.INVOICE_ITEM,
      "Odoo.xlsx - Invoice Lines",
      { invoiceSourceId: "Invoice Legacy ID", productSourceId: "Product Legacy ID", qty: "Quantity", unitPrice: "Unit Price", taxRate: "Tax Rate %" },
      [{ "Invoice Legacy ID": "INV-65332", "Product Legacy ID": "PRD-49087", Quantity: "3", "Unit Price": "68500", "Tax Rate %": "18" }],
    );

    await runWorkerUntilDone(String(batch._id));

    const invalid = await MigrationRecord.find({ batchId: batch._id, status: "invalid" }).lean();
    expect(invalid).toEqual([]);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

    const invoice = await SalesInvoice.findOne({ tenantId: TENANT, number: "INV-65332" }).lean();
    expect(invoice?.lineItems).toHaveLength(1);
    expect(invoice?.lineItems[0].name).toBe("PRD-49087");
    expect(invoice?.lineItems[0].lineTotal).toBe(205500);
  });

  it("preserves sales invoices with missing legacy customers by creating placeholders", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "odoo",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.SALES_INVOICE,
      "Odoo.xlsx - Invoices",
      { sourceId: "Legacy Invoice ID", number: "Legacy Invoice ID", customerName: "Customer Legacy ID", invoiceDate: "Invoice Date" },
      [{ "Legacy Invoice ID": "INV-MISSING-CUST", "Invoice Date": "2026-01-09", "Customer Legacy ID": "CUS-00000", "Invoice Status": "Posted" }],
    );

    await runWorkerUntilDone(String(batch._id));

    const invalid = await MigrationRecord.find({ batchId: batch._id, status: "invalid" }).lean();
    expect(invalid).toEqual([]);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

    const placeholder = await Customer.findOne({ tenantId: TENANT, "header.name": "Imported Customer CUS-00000" }).lean();
    expect(placeholder?._id).toBeTruthy();

    const invoice = await SalesInvoice.findOne({ tenantId: TENANT, number: "INV-MISSING-CUST" }).lean();
    expect(String(invoice?.customerId)).toBe(String(placeholder?._id));
  });

  it("treats Odoo customer payment rows with cleared status as receipts", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "odoo",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 2,
      totalRecords: 2,
      totalModules: 2,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.CUSTOMER,
      "Odoo.xlsx - Customers",
      { sourceId: "Legacy Customer ID", name: "Customer Name", email: "Email" },
      [{ "Legacy Customer ID": "CUS-40234", "Customer Name": "BluePeak Manufacturing Pvt Ltd", Email: "bluepeak@legacy.example" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PAYMENT,
      "Odoo.xlsx - Payments",
      { sourceId: "Legacy Payment ID", reference: "Legacy Payment ID", type: "Payment Status", partyName: "Customer Legacy ID", amount: "Amount", date: "Payment Date" },
      [{ "Legacy Payment ID": "PAY-72155", "Payment Date": "2026-02-18", "Invoice Legacy ID": "INV-37257", "Customer Legacy ID": "CUS-40234", Amount: "285000", "Payment Method": "Bank Transfer", "Payment Status": "Cleared" }],
    );

    await runWorkerUntilDone(String(batch._id));

    const invalid = await MigrationRecord.find({ batchId: batch._id, status: "invalid" }).lean();
    expect(invalid).toEqual([]);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

    const customer = await Customer.findOne({ tenantId: TENANT, "header.name": "BluePeak Manufacturing Pvt Ltd" }).lean();
    const payment = await Payment.findOne({ tenantId: TENANT, paymentNumber: "PAY-72155" }).lean();
    expect(String(payment?.customerId)).toBe(String(customer?._id));
    expect(payment?.amountReceived).toBe(285000);
    expect(payment?.unusedAmount).toBe(285000);
  });

  it("resolves customer receipts through invoice number when payment rows omit customer code", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 3,
      totalRecords: 3,
      totalModules: 3,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.CUSTOMER,
      "MD_V3.xlsx - Customers",
      { sourceId: "Customer Code", name: "Customer Name", email: "Email Address" },
      [{ "Customer Code": "CUSV3-41000", "Customer Name": "Arjun Menon", "Email Address": "arjun_menon@demo-customer.example" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.SALES_INVOICE,
      "MD_V3.xlsx - Invoices",
      { sourceId: "Invoice No", number: "Invoice No", customerName: "Customer Code", invoiceDate: "Invoice Date", totalAmount: "Invoice Total" },
      [{ "Invoice No": "INV-V3-91000", "Customer Code": "CUSV3-41000", "Invoice Date": "2026-01-31", "Invoice Total": "3675" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PAYMENT,
      "MD_V3.xlsx - Payments",
      { sourceId: "Payment Ref", invoiceSourceId: "Invoice No", type: "Payment Mode", reference: "Reference No", amount: "Amount", date: "Payment Date" },
      [{ "Payment Ref": "PAY-V3-95000", "Invoice No": "INV-V3-91000", "Payment Date": "2026-02-09", "Payment Mode": "Payment", "Reference No": "REF-330000", Amount: "3675", Status: "Cleared" }],
    );

    await runWorkerUntilDone(String(batch._id));

    const invalid = await MigrationRecord.find({ batchId: batch._id, status: "invalid" }).lean();
    expect(invalid).toEqual([]);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

    const customer = await Customer.findOne({ tenantId: TENANT, "header.name": "Arjun Menon" }).lean();
    const payment = await Payment.findOne({ tenantId: TENANT, paymentNumber: "PAY-V3-95000" }).lean();
    expect(String(payment?.customerId)).toBe(String(customer?._id));
    expect(payment?.reference).toBe("REF-330000");
    expect(payment?.amountReceived).toBe(3675);
  });

  it("flags duplicate uploaded master records during validation without blocking repeated invoice lines", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "tally",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 4,
      totalRecords: 6,
      totalModules: 4,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.CUSTOMER,
      "customers.csv",
      { sourceId: "Customer ID", name: "Customer Name", email: "Email ID", gstin: "GSTIN" },
      [
        { "Customer ID": "CUST-001", "Customer Name": "Acme Industries", "Email ID": "ap@acme.example", GSTIN: "27ABCDE1234F1Z5" },
        { "Customer ID": "CUST-001-DUP", "Customer Name": "Acme Industries", "Email ID": "ap@acme.example", GSTIN: "27ABCDE1234F1Z5" },
      ],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "products.csv",
      { sourceId: "Product ID", name: "Item Name", sku: "SKU", salesPrice: "Rate" },
      [{ "Product ID": "PROD-001", "Item Name": "Precision Lens", SKU: "LENS-001", Rate: "1250.50" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.SALES_INVOICE,
      "sales-invoices.csv",
      { sourceId: "Invoice ID", number: "Invoice Number", customerName: "Customer Name", invoiceDate: "Date", totalAmount: "Total" },
      [{ "Invoice ID": "INV-SRC-001", "Invoice Number": "INV-001", "Customer Name": "Acme Industries", Date: "2026-09-01", Total: "2501.00" }],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.INVOICE_ITEM,
      "invoice-items.csv",
      { invoiceSourceId: "Invoice Number", productSourceId: "SKU", productName: "Item Name", qty: "Qty", unitPrice: "Rate", lineTotal: "Amount" },
      [
        { "Invoice Number": "INV-001", SKU: "LENS-001", "Item Name": "Precision Lens", Qty: "1", Rate: "1250.50", Amount: "1250.50" },
        { "Invoice Number": "INV-001", SKU: "LENS-001", "Item Name": "Precision Lens", Qty: "1", Rate: "1250.50", Amount: "1250.50" },
      ],
    );

    await runWorkerUntilDone(String(batch._id));

    const customerStatuses = await MigrationRecord.find({
      batchId: batch._id,
      entityType: MIGRATION_ENTITY.CUSTOMER,
    }).select("status errors").lean();
    expect(customerStatuses.map((record) => record.status).sort()).toEqual(["duplicate", "valid"]);
    expect(customerStatuses.some((record) => /Duplicate record found in uploaded data using/.test(record.errors?.[0]?.message || ""))).toBe(true);

    const lineStatuses = await MigrationRecord.find({
      batchId: batch._id,
      entityType: MIGRATION_ENTITY.INVOICE_ITEM,
    }).select("status").lean();
    expect(lineStatuses.map((record) => record.status)).toEqual(["valid", "valid"]);
  });

  it("counts duplicates with null duplicateAction as unresolved blockers", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "products.xlsx - Products",
      { sourceId: "Item Code", sku: "SKU", name: "Item Description" },
      [{ "Item Code": "ITM-DUP", SKU: "SKU-DUP", "Item Description": "Duplicate Product" }],
    );

    await MigrationRecord.updateOne(
      { batchId: batch._id, jobId: job._id },
      {
        $set: {
          status: "duplicate",
          duplicateAction: null,
          duplicateReason: "upload",
          duplicateFields: ["sku"],
          mappedData: { sourceId: "ITM-DUP", sku: "SKU-DUP", name: "Duplicate Product" },
        },
      },
    );

    const unresolved = await MigrationRecord.countDocuments(unresolvedDuplicateFilter({ batchId: batch._id, tenantId: TENANT }));
    expect(unresolved).toBe(1);
  });

  it("counts merge/update and force-create duplicate decisions as valid review records", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 3,
      totalModules: 1,
    });

    const job = await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "products.xlsx - Products",
      { sourceId: "Item Code", sku: "SKU", name: "Item Description" },
      [
        { "Item Code": "ITM-1", SKU: "SKU-1", "Item Description": "Valid Product" },
        { "Item Code": "ITM-2", SKU: "SKU-2", "Item Description": "Merge Product" },
        { "Item Code": "ITM-3", SKU: "SKU-3", "Item Description": "Create Product" },
      ],
    );

    const records = await MigrationRecord.find({ batchId: batch._id, jobId: job._id }).sort({ _id: 1 });
    records[0].status = "valid";
    records[1].status = "duplicate";
    records[1].duplicateAction = "update";
    records[2].status = "duplicate";
    records[2].duplicateAction = "create";
    await Promise.all(records.map((record) => record.save()));

    const summary = await computeMigrationReviewSummary(batch._id, TENANT);
    expect(summary).toEqual({ valid: 3, invalid: 0, duplicate: 0 });
  });

  it("surfaces duplicates, optional warnings, and invalid values during preview validation", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 4,
      totalRecords: 10,
      totalModules: 4,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.CUSTOMER,
      "MD_V3.xlsx - Customers",
      { sourceId: "Customer Code", name: "Customer Name", email: "Email", phone: "Phone" },
      [
        { "Customer Code": "CUS-A", "Customer Name": "Acme Retail", Email: "billing@acme.example", Phone: "8600000000" },
        { "Customer Code": "CUS-B", "Customer Name": "Acme Retail", Email: "billing@acme.example", Phone: "8600000001" },
      ],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "MD_V3.xlsx - Products",
      { sourceId: "Item Code", sku: "SKU", name: "Item Name", brand: "Brand", category: "Category", stockQuantity: "Stock" },
      [
        { "Item Code": "ITM-A", SKU: "SKU-1", "Item Name": "Bluetooth Speaker", Brand: "", Category: "", Stock: "10" },
        { "Item Code": "ITM-B", SKU: "SKU-1", "Item Name": "Bluetooth Speaker", Brand: "Proline", Category: "Audio", Stock: "10" },
        { "Item Code": "ITM-C", SKU: "SKU-2", "Item Name": "Invalid Stock", Brand: "Proline", Category: "Audio", Stock: "-1" },
      ],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.SALES_INVOICE,
      "MD_V3.xlsx - Invoices",
      { sourceId: "Invoice No", number: "Invoice No", customerName: "Customer Code", invoiceDate: "Invoice Date" },
      [
        { "Invoice No": "INV-GOOD", "Customer Code": "CUS-A", "Invoice Date": "2026-02-28" },
        { "Invoice No": "INV-BAD", "Customer Code": "CUS-A", "Invoice Date": "31/02/2026" },
      ],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PAYMENT,
      "MD_V3.xlsx - Payments",
      { sourceId: "Payment Ref", partyName: "Customer Code", reference: "Reference No", amount: "Amount", date: "Payment Date", type: "Payment Mode" },
      [
        { "Payment Ref": "PAY-A", "Customer Code": "CUS-A", "Reference No": "REF-DUP", Amount: "100", "Payment Date": "2026-03-01", "Payment Mode": "UPI" },
        { "Payment Ref": "PAY-B", "Customer Code": "CUS-A", "Reference No": "REF-DUP", Amount: "200", "Payment Date": "2026-03-02", "Payment Mode": "Cheque" },
      ],
    );

    await runWorkerUntilDone(String(batch._id));

    const customerDuplicates = await MigrationRecord.find({ batchId: batch._id, entityType: MIGRATION_ENTITY.CUSTOMER, status: "duplicate" }).lean();
    expect(customerDuplicates).toHaveLength(1);
    expect(customerDuplicates[0].duplicateFields).toEqual(["email", "name"]);

    const productDuplicate = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.PRODUCT, status: "duplicate" }).lean();
    expect(productDuplicate?.duplicateFields).toEqual(["sku"]);

    const paymentDuplicate = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.PAYMENT, status: "duplicate" }).lean();
    expect(paymentDuplicate?.duplicateFields).toEqual(["reference"]);

    const warnedProduct = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.PRODUCT, "mappedData.sku": "SKU-1", status: "valid" }).lean();
    expect(warnedProduct?.warnings?.map((warning: any) => warning.field).sort()).toEqual(["brand", "category"]);

    const invalidRecords = await MigrationRecord.find({ batchId: batch._id, status: "invalid" }).select("entityType errors").lean();
    expect(invalidRecords).toHaveLength(2);
    expect(invalidRecords.some((record) => record.entityType === MIGRATION_ENTITY.PRODUCT && /stock quantity cannot be negative/.test(record.errors?.[0]?.message || ""))).toBe(true);
    expect(invalidRecords.some((record) => record.entityType === MIGRATION_ENTITY.SALES_INVOICE && /valid calendar date/.test(record.errors?.[0]?.message || ""))).toBe(true);
  });

  it("reconciles verified concurrent-write failures without changing business records", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT, sourceSystem: "excel", status: "completed", createdBy: USER_ID,
      summary: { migrated: 0, failed: 1, verification: { status: "FAIL", sourceVsTarget: [
        { entity: "account", sourceCount: 1, targetCount: 0, actualTargetCount: 0, failedCount: 1, orphanCount: 0, status: "FAIL" },
      ] } },
    });
    const account = await Account.create({ tenantId: TENANT, accountName: "Recovery Account", accountCode: "REC-1" });
    const job = await createJobWithRecords(batch._id, MIGRATION_ENTITY.ACCOUNT, "Recovery accounts",
      { accountName: "Name", accountCode: "Code" }, [{ Name: "Recovery Account", Code: "REC-1" }]);
    job.importedRefs.push({ model: "Account", id: account._id });
    await job.save();
    await MigrationRecord.updateMany({ jobId: job._id }, { $set: {
      status: "failed", mappedData: { accountName: "Recovery Account", accountCode: "REC-1" },
      errors: [{ message: "A duplicate record was found while writing data. Resolve the duplicate row and retry." }],
    } });
    const run = promisify(execFile);
    const args = ["scripts/migrations/reconcile-concurrent-migration.cjs", String(batch._id)];
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test", MONGODB_URI: process.env.MONGODB_URI };
    const dryRun = await run(process.execPath, args, { env });
    expect(dryRun.stdout).toContain('"safelyReconciled":1');
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "failed" })).toBe(1);
    // A value mismatch must block the entire repair.
    await Account.updateOne({ _id: account._id }, { $set: { accountName: "Different account" } });
    await expect(run(process.execPath, [...args, "--apply"], { env })).rejects.toThrow();
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "failed" })).toBe(1);
    await Account.updateOne({ _id: account._id }, { $set: { accountName: "Recovery Account" } });
    const before = await Account.findById(account._id).lean();
    const applied = await run(process.execPath, [...args, "--apply"], { env });
    expect(applied.stdout).toContain('"recovered":1');
    expect(await Account.findById(account._id).lean()).toEqual(before);
    const record = await MigrationRecord.findOne({ jobId: job._id }).lean();
    expect(record?.status).toBe("migrated");
    expect(String(record?.targetRecordId)).toBe(String(account._id));
    expect(await MigrationIdentityMap.countDocuments({ batchId: batch._id, targetId: account._id })).toBe(2);
    const recovered = await MigrationBatch.findById(batch._id).lean();
    expect(recovered?.status).toBe("verified");
    expect(recovered?.summary?.failed).toBe(0);
    expect(recovered?.summary?.verification?.status).toBe("PASS");
  });

  it("serializes simultaneous daemon and browser workers without duplicate writes", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT, sourceSystem: "excel", status: "running", createdBy: USER_ID,
      totalFiles: 1, totalRecords: 25, totalModules: 1,
    });
    const job = await createJobWithRecords(batch._id, MIGRATION_ENTITY.ACCOUNT, "Concurrent accounts",
      { accountName: "Name", accountCode: "Code" },
      Array.from({ length: 25 }, (_, i) => ({ Name: `Account ${i}`, Code: `CON-${i}` })),
    );
    await MigrationRecord.updateMany({ jobId: job._id }, { $set: { status: "valid" } });
    await Promise.all(Array.from({ length: 5 }, () => processMigrationWorker(String(batch._id), 50)));
    await runWorkerUntilDone(String(batch._id), 50);
    expect(await Account.countDocuments({ tenantId: TENANT })).toBe(25);
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "migrated" })).toBe(25);
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "failed" })).toBe(0);
    expect(await MigrationIdentityMap.countDocuments({ batchId: batch._id })).toBe(50);
    const finalBatch = await MigrationBatch.findById(batch._id).lean();
    expect(finalBatch?.processingToken).toBeUndefined();
  });

  it("recovers an expired worker lease", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT, sourceSystem: "excel", status: "running", createdBy: USER_ID,
      processingToken: "dead-worker", processingExpiresAt: new Date(Date.now() - 1000),
    });
    await processMigrationWorker(String(batch._id), 50);
    const saved = await MigrationBatch.findById(batch._id).lean();
    expect(saved?.processingToken).toBeUndefined();
    expect(["completed", "verified"]).toContain(saved?.status);
  });

  it("promotes existing account conflicts to duplicate review before migration", async () => {
    const existing = await Account.create({
      tenantId: TENANT,
      accountName: "Cash and Bank",
      accountCode: "1000",
      name: "Cash and Bank",
      code: "1000",
      account_type: "asset_cash",
      internal_group: "asset",
      status: "active",
      isActive: true,
      createdBy: USER_ID,
    });

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.ACCOUNT,
      "MD_V3.xlsx - Chart of Accounts",
      { accountName: "Account name", accountCode: "Account code", accountType: "Account type" },
      [{ "Account name": "Cash and Bank", "Account code": "1000", "Account type": "Asset" }],
    );

    await runWorkerUntilDone(String(batch._id));

    const duplicate = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.ACCOUNT }).lean();
    expect(duplicate?.status).toBe("duplicate");
    expect(duplicate?.duplicateReason).toBe("database");
    expect(String(duplicate?.duplicateTargetId)).toBe(String(existing._id));
    expect(duplicate?.duplicateFields).toEqual(["accountName", "accountCode"]);

    const refreshedBatch = await MigrationBatch.findById(batch._id).lean();
    expect(refreshedBatch?.status).toBe("preview");
    expect(refreshedBatch?.summary?.duplicate).toBe(1);
  });

  itIfFile("Northstar_Cloud_5Y_Migration_Test.xlsx").each([false, true])("validates and migrates the Northstar workbook without failed rows (existing account: %s)", async (existingAccount) => {
    if (existingAccount) {
      await Account.create({ tenantId: TENANT, accountName: "Depreciation Expense", accountCode: "DEP-OLD", code: "DEP-OLD", name: "Depreciation Expense", account_type: "expense", internal_group: "expense" });
    }
    const preparedPackage = prepareMigrationPackage(
      [{ name: "Northstar_Cloud_5Y_Migration_Test.xlsx", buffer: fs.readFileSync("Northstar_Cloud_5Y_Migration_Test.xlsx") }],
      "excel",
    );
    const prepared = preparedPackage.files;
    const totalRecords = prepared.reduce((sum, file) => sum + file.rows.length, 0);
    expect(preparedPackage.importableRecordCount).toBe(2159);
    expect(preparedPackage.sourceRecordCount).toBe(4737);
    expect(prepared.map((file) => [file.entityType, file.rows.length])).toEqual([
      [MIGRATION_ENTITY.ACCOUNT, 25],
      [MIGRATION_ENTITY.CUSTOMER, 12],
      [MIGRATION_ENTITY.VENDOR, 7],
      [MIGRATION_ENTITY.PRODUCT, 7],
      [MIGRATION_ENTITY.SALES_INVOICE, 215],
      [MIGRATION_ENTITY.PAYMENT, 213],
      [MIGRATION_ENTITY.PURCHASE_INVOICE, 381],
      [MIGRATION_ENTITY.JOURNAL_ENTRY, 1299],
    ]);

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: prepared.length,
      totalRecords,
      totalModules: prepared.length,
    });

    for (const file of prepared) {
      const schema = getEntitySchema(file.entityType)!;
      await createJobWithRecords(
        batch._id,
        file.entityType,
        file.name,
        deterministicMapping(schema, file.columns),
        file.rows,
      );
    }

    await runWorkerUntilDone(String(batch._id), 500, 100);

    const productSource = prepared.find((file) => file.entityType === MIGRATION_ENTITY.PRODUCT)!;
    const productMapping = deterministicMapping(getEntitySchema(MIGRATION_ENTITY.PRODUCT)!, productSource.columns);
    expect(productMapping).toMatchObject({
      name: "product_name",
      sku: "sku",
      category: "product_category",
      salesPrice: "list_price_inr",
      stockQuantity: "opening_stock_qty",
      description: "description",
      type: "item_type",
      preferredVendor: "preferred_vendor",
      currency: "currency",
      status: "is_active",
    });

    const customerSource = prepared.find((file) => file.entityType === MIGRATION_ENTITY.CUSTOMER)!;
    const customerMapping = deterministicMapping(getEntitySchema(MIGRATION_ENTITY.CUSTOMER)!, customerSource.columns);
    expect(customerMapping).toMatchObject({
      name: "customer_name",
      sourceId: "customer_id",
      entityType: "entity_type",
      city: "city",
      stateName: "state",
      country: "country",
      gstin: "gstin",
      currency: "currency",
      paymentTerms: "payment_terms",
      status: "is_active",
    });

    const previewSummary = {
      invalid: await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: TENANT, status: "invalid" }),
      duplicate: await MigrationRecord.countDocuments(unresolvedDuplicateFilter({ batchId: batch._id, tenantId: TENANT })),
    };
    const invalidSample = await MigrationRecord.find({ batchId: batch._id, tenantId: TENANT, status: "invalid" }).select("entityType sourceData mappedData errors").limit(3).lean();
    expect(previewSummary, JSON.stringify(invalidSample)).toEqual({ invalid: 0, duplicate: existingAccount ? 1 : 0 });
    if (existingAccount) {
      const account = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.ACCOUNT, "mappedData.accountCode": "6600" });
      expect(account?.status).toBe("duplicate");
      expect(account?.duplicateTargetId).toBeDefined();
      account!.duplicateAction = "update";
      await account!.save();
    }

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 1 } });
    await runWorkerUntilDone(String(batch._id), 500, 100);

    const finalBatch = await MigrationBatch.findById(batch._id).lean();
    const failedSample = await MigrationRecord.find({ batchId: batch._id, tenantId: TENANT, status: "failed" }).select("entityType sourceData mappedData errors").limit(5).lean();
    expect(finalBatch?.summary?.failed || 0, JSON.stringify(failedSample)).toBe(0);
    expect(["completed", "verified"]).toContain(finalBatch?.status);
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, tenantId: TENANT, status: "failed" })).toBe(0);

    expect(await Account.countDocuments({ tenantId: TENANT })).toBe(25);
    expect(await Account.findOne({ tenantId: TENANT, code: "1590" }).select("normal_balance is_contra_account").lean())
      .toMatchObject({ normal_balance: "credit", is_contra_account: true });
    expect(await Vendor.countDocuments({ tenantId: TENANT })).toBe(7);
    expect(await Product.countDocuments({ tenantId: TENANT })).toBe(7);
    expect(await (SalesInvoice as any).countDocuments({ tenantId: TENANT })).toBe(215);
    expect(await (SalesInvoice as any).countDocuments({ tenantId: TENANT, number: /^INV-/ })).toBe(215);
    const salesInvoiceIndexes = await SalesInvoice.collection.indexes();
    expect(salesInvoiceIndexes.some((index) => index.unique && index.key.tenantId === 1 && index.key.number === 1)).toBe(true);
    await expect(SalesInvoice.create({
      tenantId: TENANT,
      number: "INV-000215",
      customerId: new mongoose.Types.ObjectId(),
      invoiceDate: new Date("2026-03-18T00:00:00.000Z"),
      dueDate: new Date("2026-10-15T00:00:00.000Z"),
      taxableAmount: 42000,
      totalAmount: 42000,
    })).rejects.toMatchObject({ code: 11000 });
    expect(await (SalesInvoice as any).countDocuments({ tenantId: TENANT })).toBe(215);
    expect(await Payment.countDocuments({ tenantId: TENANT })).toBe(213);
    expect(await Invoice.countDocuments({ tenantId: TENANT, moveType: "in_invoice" })).toBe(381);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT, status: "posted" })).toBe(1299);

    const workbook = xlsx.read(fs.readFileSync("Northstar_Cloud_5Y_Migration_Test.xlsx"), { type: "buffer" });
    const sourceInvoices = xlsx.utils.sheet_to_json(workbook.Sheets.Invoices, { defval: "" }) as Record<string, any>[];
    const importedInvoice = await SalesInvoice.findOne({ tenantId: TENANT, number: "INV-000215" }).lean();
    const sourceInvoice = sourceInvoices.find((row) => row.invoice_id === "INV-000215");
    expect(importedInvoice?.totalAmount).toBe(Number(sourceInvoice?.total_inr));
    expect(importedInvoice?.taxableAmount).toBe(Number(sourceInvoice?.subtotal_inr));
    expect(importedInvoice?.dueDate?.toISOString().slice(0, 10)).toBe(sourceInvoice?.due_date);

    const postedReport = await buildPostedJournalReport({ tenantId: TENANT, endDate: new Date("2026-03-31T00:00:00.000Z") });
    expect(postedReport.totals.balanced).toBe(true);
    expect(postedReport.asset.total).not.toBe(0);
    expect(postedReport.income.total).not.toBe(0);
    expect(postedReport.asset.total).toBeCloseTo(-25824972, 2);
    expect(postedReport.liability.total).toBeCloseTo(-4049472, 2);
    expect(postedReport.income.total - postedReport.expense.total).toBeCloseTo(-24275500, 2);
    expect(postedReport.equity.total + postedReport.income.total - postedReport.expense.total)
      .toBeCloseTo(-21775500, 2);
    expect(Math.abs(postedReport.asset.total - (postedReport.liability.total + postedReport.equity.total + postedReport.income.total - postedReport.expense.total)))
      .toBeLessThanOrEqual(0.01);
    expect(postedReport.activity.postedEntryCount).toBe(1299);
    expect(postedReport.activity.latestPostedDate?.toISOString().slice(0, 10)).toBe("2026-03-31");

    const octoberReport = await buildPostedJournalReport({
      tenantId: TENANT,
      endDate: new Date("2026-10-15T00:00:00.000Z"),
      endDateTimeZone: "Asia/Kolkata",
    });
    expect(octoberReport.activity.postedEntryCount).toBe(1299);
    expect(octoberReport.activity.latestPostedDate?.toISOString().slice(0, 10)).toBe("2026-03-31");
    expect(octoberReport.asset.total).toBeCloseTo(postedReport.asset.total, 2);
    expect(octoberReport.liability.total).toBeCloseTo(postedReport.liability.total, 2);
    const reportAccounts = Object.values(postedReport).flatMap((group: any) => Object.values(group.accounts || {}) as any[]);
    const sourceBalanceSheet = xlsx.utils.sheet_to_json(workbook.Sheets["Balance Sheet"], { defval: "" }) as Record<string, any>[];
    for (const row of sourceBalanceSheet.filter((item) => item.as_of_date === "2026-03-31")) {
      // The source workbook carries cumulative retained earnings as a closing
      // balance but has no retained-earnings closing journal. The app's
      // Balance Sheet correctly derives that line from cumulative posted P&L.
      const actual = String(row.account_code) === "3100"
        ? postedReport.income.total - postedReport.expense.total
        : reportAccounts.find((account) => account.code === String(row.account_code))?.amount ?? 0;
      expect(actual, `balance sheet account ${row.account_code}`).toBeCloseTo(Number(row.balance_inr), 2);
    }
    const sourceProfitAndLoss = xlsx.utils.sheet_to_json(workbook.Sheets["P&L Annual"], { defval: "" }) as Record<string, any>[];
    const fyRows = sourceProfitAndLoss.filter((item) => item.fiscal_year === "FY2025-26");
    const pAndLReport = await buildPostedJournalReport({
      tenantId: TENANT,
      startDate: new Date("2025-04-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
    });
    for (const row of fyRows) {
      const group = String(row.account_type).toLowerCase() === "revenue" ? pAndLReport.income : pAndLReport.expense;
      const actual = group.accounts[String(row.account_code)]?.amount ?? 0;
      expect(actual, `P&L account ${row.account_code}`).toBeCloseTo(Number(row.amount_inr), 2);
    }

    const receiptSource = prepared.find((file) => file.entityType === MIGRATION_ENTITY.PAYMENT)!;
    const linkedReceipts = await Payment.find({ tenantId: TENANT })
      .populate({ path: "allocations.invoiceId", select: "number customerId tenantId" })
      .lean();
    expect(linkedReceipts).toHaveLength(213);
    for (const source of receiptSource.rows) {
      const receipt = linkedReceipts.find((candidate: any) => candidate.paymentNumber === source.receipt_id) as any;
      expect(receipt?.allocations).toHaveLength(1);
      expect(receipt.allocations[0].invoiceId?.number).toBe(source.invoice_id);
      expect(receipt.allocations[0].invoiceId?.tenantId).toBe(TENANT);
      expect(receipt.allocations[0].invoiceId?.customerId).toEqual(receipt.customerId);
    }

    const importedProducts = await Product.find({ tenantId: TENANT }).lean();
    const expectedProductNames = productSource.rows.map((row) => String(row.product_name));
    expect(importedProducts.map((product) => product.header.name).sort()).toEqual(expectedProductNames.sort());
    for (const source of productSource.rows) {
      const product = importedProducts.find((candidate) => candidate.tab_general_information.default_code === source.sku);
      expect(product).toBeDefined();
      expect(product?.tab_general_information.list_price).toBe(Number(source.list_price_inr));
      expect(product?.tab_general_information.description).toContain(`Category: ${source.product_category}`);
      expect(product?.tab_general_information.description).toContain(`Currency: ${source.currency}`);
      expect(product?.status).toBe(String(source.is_active).toLowerCase() === "false" ? "draft" : "published");
    }

    const openingStock = await Stock.find({ tenantId: TENANT, migrationSourceKey: { $exists: true } }).lean();
    expect(openingStock).toHaveLength(2);
    expect(openingStock.map((movement) => movement.quantity).sort((a, b) => a - b)).toEqual([12, 35]);
    for (const movement of openingStock) {
      expect(importedProducts.some((product) => String(product._id) === String(movement.product))).toBe(true);
      expect(movement.type).toBe("in");
      expect(movement.migrationBatchId).toBe(String(batch._id));
      expect(await getOnHandQuantity(TENANT, String(movement.product))).toBe(movement.quantity);
    }

    const expectedCustomerNames = customerSource.rows.map((row) => String(row.customer_name)).sort();
    const importedCustomerNames = (await Customer.find({ tenantId: TENANT, "customFields.sourceEntityType": { $exists: true } })
      .select("header.name")
      .lean()).map((customer) => customer.header.name).sort();
    expect(importedCustomerNames).toEqual(expectedCustomerNames);
    expect(await Customer.countDocuments({ tenantId: TENANT, "customFields.migrationPartnerType": "vendor" })).toBeLessThanOrEqual(7);

    const importedBills = await Invoice.find({ tenantId: TENANT, moveType: "in_invoice" })
      .populate({ path: "vendorId", match: { tenantId: TENANT }, select: "name tenantId" })
      .populate({ path: "partnerId", select: "header.name tenantId" })
      .lean();
    expect(importedBills).toHaveLength(381);
    expect(importedBills.every((bill: any) => bill.migrationVendorSourceId)).toBe(true);
    expect(importedBills.map((bill: any) => bill.migrationOriginalBillNumber).sort()).toEqual(
      prepared.find((file) => file.entityType === MIGRATION_ENTITY.PURCHASE_INVOICE)!.rows.map((row) => String(row.bill_id)).sort(),
    );
    expect(importedBills.every((bill: any) => bill.vendorId?.tenantId === TENANT)).toBe(true);
    expect(importedBills.every((bill: any) => Boolean(bill.partnerId?.header?.name))).toBe(true);
    expect(importedBills.every((bill: any) => bill.partnerId.header.name === bill.vendorId.name)).toBe(true);

    const vendorJob = await MigrationJob.findOne({ batchId: batch._id, tenantId: TENANT, entityType: MIGRATION_ENTITY.VENDOR }).lean();
    const vendorSource = prepared.find((file) => file.entityType === MIGRATION_ENTITY.VENDOR)!;
    const vendorIds = vendorSource.rows.map((row) => String(row.vendor_id));
    for (const vendorId of vendorIds) {
      const targetId = await MigrationIdentityMap.findOne({ batchId: batch._id, tenantId: TENANT, entityType: MIGRATION_ENTITY.VENDOR, sourceId: vendorId }).select("targetId").lean();
      expect(targetId?.targetId).toBeDefined();
      const tenantVendor = await Vendor.findOne({ _id: targetId?.targetId, tenantId: TENANT }).lean();
      expect(tenantVendor).toBeDefined();
    }
    expect(vendorJob).toBeDefined();

    const stockCountBeforeRetry = await Stock.countDocuments({ tenantId: TENANT, migrationSourceKey: { $exists: true } });
    const duplicateProductRetry = await executeImport(
      MIGRATION_ENTITY.PRODUCT,
      [productSource.rows.find((row) => Number(row.opening_stock_qty) === 35)!],
      productMapping,
      { tenantId: TENANT, userId: String(USER_ID), batchId: String(batch._id), resolveRef: async () => null },
    );
    expect(duplicateProductRetry.created).toBe(0);
    expect(await Stock.countDocuments({ tenantId: TENANT, migrationSourceKey: { $exists: true } })).toBe(stockCountBeforeRetry);
  }, 60_000);

  itIfFile("MD_V3.xlsx")("validates the MD_V3 workbook to preview without product taxonomy false errors", async () => {
    const prepared = prepareMigrationFiles(
      [{ name: "MD_V3.xlsx", buffer: fs.readFileSync("MD_V3.xlsx") }],
      "excel",
    );

    expect(prepared.map((file) => file.entityType)).toEqual([
      MIGRATION_ENTITY.CUSTOMER,
      MIGRATION_ENTITY.VENDOR,
      MIGRATION_ENTITY.PRODUCT,
      MIGRATION_ENTITY.SALES_ORDER,
      MIGRATION_ENTITY.SALES_ORDER_LINE,
      MIGRATION_ENTITY.SALES_INVOICE,
      MIGRATION_ENTITY.PAYMENT,
    ]);

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: prepared.length,
      totalRecords: prepared.reduce((sum, file) => sum + file.rows.length, 0),
      totalModules: prepared.length,
    });

    for (const file of prepared) {
      const schema = getEntitySchema(file.entityType)!;
      await createJobWithRecords(
        batch._id,
        file.entityType,
        file.name,
        deterministicMapping(schema, file.columns),
        file.rows,
      );
    }

    await runWorkerUntilDone(String(batch._id), 50, 20);

    const finalBatch = await MigrationBatch.findById(batch._id).lean();
    expect(finalBatch?.status).toBe("preview");

    const productTypeErrors = await MigrationRecord.find({
      batchId: batch._id,
      entityType: MIGRATION_ENTITY.PRODUCT,
      status: "invalid",
      "errors.message": /Product type must be one of/i,
    }).lean();
    expect(productTypeErrors).toEqual([]);
  });

  it("shares in-flight account lookups across concurrent journal validation rows", async () => {
    const batch = await MigrationBatch.create({ tenantId: TENANT, sourceSystem: "excel", status: "validating", createdBy: USER_ID });
    await Account.create({ tenantId: TENANT, accountName: "Revenue", accountCode: "4100", code: "4100", name: "Revenue", account_type: "income", internal_group: "income" });
    await Account.create({ tenantId: TENANT, accountName: "Depreciation Expense", accountCode: "6600", code: "6600", name: "Depreciation Expense", account_type: "expense", internal_group: "expense" });
    await createJobWithRecords(batch._id, MIGRATION_ENTITY.JOURNAL_ENTRY, "journals.csv",
      { journalId: "journal_id", journalDate: "journal_date", status: "status", linesJson: "lines_json" },
      Array.from({ length: 20 }, (_, index) => ({ journal_id: `JE-CACHE-${index}`, journal_date: "2026-03-31", status: "Posted", lines_json: JSON.stringify([
        { account_code: "6600", debit_inr: 100 },
        { account_code: "4100", credit_inr: 100 },
      ]) })));
    const lookup = vi.spyOn(Account, "findOne");
    try {
      expect(await processMigrationWorker(String(batch._id), 50)).toMatchObject({ processed: 20 });
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "valid" })).toBe(20);
    } finally {
      lookup.mockRestore();
    }
  });

  it("resumes a legacy batch at 99% using bounded final-check pages and retains target errors", async () => {
    const batch = await MigrationBatch.create({ tenantId: TENANT, sourceSystem: "excel", status: "validating", progress: 99, createdBy: USER_ID });
    const job = await createJobWithRecords(batch._id, MIGRATION_ENTITY.JOURNAL_ENTRY, "journals.csv", {}, Array.from({ length: 201 }, (_, index) => ({ index })));
    const rows = await MigrationRecord.find({ jobId: job._id }).sort({ _id: 1 });
    for (const [index, row] of rows.entries()) {
      row.status = "valid";
      row.mappedData = { journalId: `JE-FINAL-${index}`, journalDate: "2026-03-31", status: "Posted", linesJson: JSON.stringify([
        { account_code: "6600", debit_inr: index === 1 ? 101 : 100 },
        { account_code: "4100", credit_inr: 100 },
      ]) };
      await row.save();
    }

    // Each call reacquires the batch, as a new production request would.
    expect(await processMigrationWorker(String(batch._id), 1)).toMatchObject({ done: false, processed: 200 });
    const firstPage = await MigrationBatch.findById(batch._id).lean();
    expect(String(firstPage?.validationCursor)).toBe(String(rows[199]._id));
    expect(firstPage?.status).toBe("validating");
    expect(await processMigrationWorker(String(batch._id), 1)).toMatchObject({ done: false, processed: 1 });
    const finalPage = await MigrationBatch.findById(batch._id).lean();
    expect(String(finalPage?.validationCursor)).toBe(String(rows[200]._id));
    expect(finalPage?.status).toBe("validating");
    expect(await processMigrationWorker(String(batch._id), 1)).toMatchObject({ done: true });
    const finished = await MigrationBatch.findById(batch._id).lean();
    expect(finished?.status).toBe("preview");
    expect(finished?.progress).toBe(100);
    expect(finished?.validationCursor).toBeUndefined();
    expect(finished?.summary).toMatchObject({ valid: 200, invalid: 1, duplicate: 0 });
    expect((await MigrationRecord.findById(rows[1]._id).lean())?.errors[0].message).toMatch(/out of balance/);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(0);
  });

  it("restarts final checks when an earlier row is queued for revalidation", async () => {
    const batch = await MigrationBatch.create({ tenantId: TENANT, sourceSystem: "excel", status: "validating", progress: 99, createdBy: USER_ID });
    const job = await createJobWithRecords(batch._id, MIGRATION_ENTITY.ACCOUNT, "accounts.csv",
      { accountName: "Name", accountCode: "Code", accountType: "Type" },
      [{ Name: "Revenue", Code: "4100", Type: "Revenue" }]);
    const row = await MigrationRecord.findOne({ jobId: job._id });
    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { validationCursor: row!._id } });
    await processMigrationWorker(String(batch._id), 1);
    expect((await MigrationBatch.findById(batch._id).lean())?.validationCursor).toBeUndefined();
    expect(await processMigrationWorker(String(batch._id), 1)).toMatchObject({ done: false, processed: 1 });
    expect(String((await MigrationBatch.findById(batch._id).lean())?.validationCursor)).toBe(String(row!._id));
    await runWorkerUntilDone(String(batch._id), 1);
    expect((await MigrationBatch.findById(batch._id).lean())?.status).toBe("preview");
  });

  it.each(["update", "create"] as const)("imports approved %s Accounts before journals across chunk boundaries and preserves source references", async (action) => {
    const batch = await MigrationBatch.create({ tenantId: TENANT, sourceSystem: "excel", status: "running", createdBy: USER_ID, totalFiles: 2, totalRecords: 2, totalModules: 2 });
    await Account.create({ tenantId: TENANT, accountName: "Revenue", accountCode: "4100", code: "4100", name: "Revenue", account_type: "income", internal_group: "income" });
    const existing = await Account.create({ tenantId: TENANT, accountName: "Depreciation Expense", accountCode: action === "update" ? "DEP-OLD" : "6600", code: action === "update" ? "DEP-OLD" : "6600", name: "Depreciation Expense", account_type: "expense", internal_group: "expense" });
    // Insert the journal first, and use a one-row chunk. Sorting a limited
    // result cannot bring in the later duplicate Account needed by this row.
    await createJobWithRecords(batch._id, MIGRATION_ENTITY.JOURNAL_ENTRY, "journals.csv",
      { journalId: "journal_id", journalDate: "journal_date", status: "status", linesJson: "lines_json" },
      [{ journal_id: "JE-ORDER", journal_date: "2026-03-31", status: "Posted", lines_json: JSON.stringify([
        { account_code: "6600", debit_inr: 100, credit_inr: 0 },
        { account_code: "4100", debit_inr: 0, credit_inr: 100 },
      ]) }]);
    await createJobWithRecords(batch._id, MIGRATION_ENTITY.ACCOUNT, "accounts.csv",
      { accountName: "account_name", accountCode: "account_code", accountType: "account_type" },
      [{ account_name: "Depreciation Expense", account_code: "6600", account_type: "Expense" }]);
    const journal = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.JOURNAL_ENTRY });
    const source = journal!.sourceData as any;
    journal!.status = "valid";
    journal!.mappedData = { journalId: source.journal_id, journalDate: source.journal_date, status: source.status, linesJson: source.lines_json };
    await journal!.save();
    const account = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.ACCOUNT });
    account!.status = "duplicate";
    account!.duplicateAction = action;
    account!.duplicateTargetId = existing._id as mongoose.Types.ObjectId;
    account!.mappedData = { accountName: "Depreciation Expense", accountCode: "6600", accountType: "Expense" };
    await account!.save();
    expect((await checkJournalAccountDependencies(batch._id, TENANT)).ready).toBe(true);
    expect(await runWriteReadinessCheck(batch)).toBe(0);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(0);

    await processMigrationWorker(String(batch._id), 1);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(0);
    expect((await MigrationRecord.findById(account!._id).lean())?.status).toBe("migrated");
    expect((await MigrationRecord.findById(journal!._id).lean())?.status).toBe("valid");
    await runWorkerUntilDone(String(batch._id), 1);
    const targetAccount = await MigrationRecord.findById(account!._id).lean();
    const targetJournal = await JournalEntry.findOne({ tenantId: TENANT, "header.name": "JE-ORDER" }).lean();
    expect(String(targetJournal?.lineIds[0]?.accountId)).toBe(String(targetAccount?.targetRecordId));
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "failed" })).toBe(0);
    if (action === "create") expect(String(targetAccount?.targetRecordId)).not.toBe(String(existing._id));
  });

  it("validates master references first even when the journal sheet is uploaded first", async () => {
    const batch = await MigrationBatch.create({ tenantId: TENANT, sourceSystem: "excel", status: "validating", createdBy: USER_ID, totalFiles: 2, totalRecords: 3, totalModules: 2 });
    await createJobWithRecords(batch._id, MIGRATION_ENTITY.JOURNAL_ENTRY, "journals.csv",
      { journalId: "journal_id", journalDate: "journal_date", status: "status", linesJson: "lines_json" },
      [{ journal_id: "JE-REVERSED", journal_date: "2026-03-31", status: "Posted", lines_json: JSON.stringify([
        { account_code: "6600", debit_inr: 100, credit_inr: 0 },
        { account_code: "4100", debit_inr: 0, credit_inr: 100 },
      ]) }]);
    await createJobWithRecords(batch._id, MIGRATION_ENTITY.ACCOUNT, "accounts.csv",
      { accountName: "account_name", accountCode: "account_code", accountType: "account_type" },
      [{ account_name: "Depreciation Expense", account_code: "6600", account_type: "Expense" }, { account_name: "Revenue", account_code: "4100", account_type: "Revenue" }]);
    await runWorkerUntilDone(String(batch._id), 1);
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "invalid" })).toBe(0);
    expect(await Account.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(0);
    // A stale preview cannot authorize changed target data without another
    // target check. Reject it while all business collections remain untouched.
    await MigrationRecord.updateOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.JOURNAL_ENTRY }, { $set: { "mappedData.linesJson": JSON.stringify([
      { account_code: "6600", debit_inr: 101, credit_inr: 0 },
      { account_code: "4100", debit_inr: 0, credit_inr: 100 },
    ]) } });
    expect(await runWriteReadinessCheck(batch)).toBe(1);
    expect(await MigrationRecord.countDocuments({ batchId: batch._id, status: "invalid" })).toBe(1);
    expect(await Account.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(0);
  });

  it("blocks journals from relying on skipped account rows and reopens the required account decision", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 2,
      totalRecords: 2,
      totalModules: 2,
    });
    const accountJobId = new mongoose.Types.ObjectId();
    const journalJobId = new mongoose.Types.ObjectId();
    await Account.create({ tenantId: TENANT, accountName: "Sales Revenue", accountCode: "4100", name: "Sales Revenue", code: "4100", account_type: "income", internal_group: "income" });
    await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: accountJobId,
      entityType: MIGRATION_ENTITY.ACCOUNT,
      sourceData: { account_code: "6600", account_name: "Depreciation Expense" },
      mappedData: { accountCode: "6600", accountName: "Depreciation Expense" },
      status: "skipped",
      duplicateAction: "skip",
    });
    const journal = await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: journalJobId,
      entityType: MIGRATION_ENTITY.JOURNAL_ENTRY,
      sourceData: {},
      mappedData: {
        journalId: "JE-SKIPPED-ACCOUNT",
        linesJson: JSON.stringify([
          { line_no: 1, account_code: "6600", debit_inr: 100, credit_inr: 0 },
          { line_no: 2, account_code: "4100", debit_inr: 0, credit_inr: 100 },
        ]),
      },
      status: "invalid",
      errors: [{ message: "Account code '6600' is present in this batch but its Account row was skipped." }],
    });

    const firstCheck = await checkJournalAccountDependencies(batch._id, TENANT);
    expect(firstCheck).toMatchObject({ ready: false, reopenedSkipped: 1, missing: [] });
    expect((await MigrationRecord.findById(journal._id).lean())?.status).toBe("invalid");
    const reopenedAccount = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.ACCOUNT }).lean();
    expect(reopenedAccount?.status).toBe("duplicate");
    expect(reopenedAccount?.duplicateAction).toBeUndefined();
    expect(reopenedAccount?.errors?.[0]?.message).toMatch(/journal entries require it/i);

    await MigrationRecord.updateOne({ _id: reopenedAccount?._id }, { $set: { duplicateAction: "create" } });
    await expect(checkJournalAccountDependencies(batch._id, TENANT)).resolves.toMatchObject({ ready: true });
  });

  it("marks a journal invalid before migration when its account is absent from both workspace and batch", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });
    const journal = await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: new mongoose.Types.ObjectId(),
      entityType: MIGRATION_ENTITY.JOURNAL_ENTRY,
      sourceData: {},
      mappedData: {
        journalId: "JE-MISSING-ACCOUNT",
        linesJson: JSON.stringify([
          { line_no: 1, account_code: "6600", debit_inr: 100, credit_inr: 0 },
          { line_no: 2, account_code: "4100", debit_inr: 0, credit_inr: 100 },
        ]),
      },
      status: "valid",
    });

    const result = await checkJournalAccountDependencies(batch._id, TENANT);
    expect(result.ready).toBe(false);
    expect(result.missing.map((item) => item.code)).toEqual(["6600", "4100"]);
    const invalid = await MigrationRecord.findById(journal._id).lean();
    expect(invalid?.status).toBe("invalid");
    expect(invalid?.errors).toHaveLength(2);
    expect(invalid?.errors[0].message).toMatch(/before starting migration/i);
  });

  it("turns a target-side Account write failure into editable review before dependent journals run", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "running",
      createdBy: USER_ID,
      totalFiles: 2,
      totalRecords: 2,
      totalModules: 2,
    });
    await Account.create({ tenantId: TENANT, accountName: "Sales Revenue", accountCode: "4100", name: "Sales Revenue", code: "4100", account_type: "income", internal_group: "income" });
    const account = await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: new mongoose.Types.ObjectId(),
      entityType: MIGRATION_ENTITY.ACCOUNT,
      sourceData: { account_code: "6600", account_name: "Depreciation Expense" },
      mappedData: { accountCode: "6600", accountName: "Depreciation Expense" },
      status: "failed",
      errors: [{ message: "Target account write rejected." }],
    });
    const journal = await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: new mongoose.Types.ObjectId(),
      entityType: MIGRATION_ENTITY.JOURNAL_ENTRY,
      sourceData: {},
      mappedData: {
        journalId: "JE-FAILED-ACCOUNT",
        linesJson: JSON.stringify([
          { line_no: 1, account_code: "6600", debit_inr: 100, credit_inr: 0 },
          { line_no: 2, account_code: "4100", debit_inr: 0, credit_inr: 100 },
        ]),
      },
      status: "valid",
    });

    const result = await checkJournalAccountDependencies(batch._id, TENANT);
    expect(result).toMatchObject({ ready: false, failedAccounts: 1 });
    expect((await MigrationRecord.findById(account._id).lean())?.status).toBe("invalid");
    const reviewedJournal = await MigrationRecord.findById(journal._id).lean();
    expect(reviewedJournal?.status).toBe("invalid");
    expect(reviewedJournal?.errors?.[0]?.message).toMatch(/not available.*before starting migration/i);
  });

  it("revalidates stale invalid product taxonomy rows after automatic fixes", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "MD_V3.xlsx - Products",
      { sourceId: "Item Code", sku: "SKU", name: "Item Description", type: "Product Type", brand: "Brand", category: "Category" },
      [{ "Item Code": "ITMV3-61003", SKU: "SKU-V3-73003", "Item Description": "Pulse Barcode Scanner", Category: "Printing", "Product Type": "Equipment", Brand: "Kryton" }],
    );

    await MigrationRecord.updateOne(
      { batchId: batch._id, jobId: job._id },
      {
        $set: {
          status: "invalid",
          mappedData: { sourceId: "ITMV3-61003", sku: "SKU-V3-73003", name: "Pulse Barcode Scanner", type: "Equipment" },
          errors: [{ message: "Product type must be one of: consumable, service, combo, hardware, accessory, goods, or item." }],
        },
      },
    );

    const invalid = await MigrationRecord.findOne({ batchId: batch._id, status: "invalid" }).lean();
    const { fastFixMigrationRecord } = await import("@/lib/migration/aiFix");
    const result = await fastFixMigrationRecord(String(batch._id), TENANT, String(invalid?._id));
    expect(result.fixed).toBe(true);

    await runWorkerUntilDone(String(batch._id));

    const record = await MigrationRecord.findOne({ batchId: batch._id }).lean();
    expect(record?.status).toBe("valid");
    expect(record?.errors).toEqual([]);
  });

  it("does not show automatic fix success when a required source value is still missing", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.CUSTOMER,
      "customers.csv",
      { sourceId: "Customer Code", name: "Customer Name", email: "Email" },
      [{ "Customer Code": "CUS-MISSING-NAME", "Customer Name": "", Email: "billing@example.com" }],
    );

    await MigrationRecord.updateOne(
      { batchId: batch._id, jobId: job._id },
      {
        $set: {
          status: "invalid",
          mappedData: { sourceId: "CUS-MISSING-NAME", name: "", email: "billing@example.com" },
          errors: [{ field: "name", message: "Missing required field: Name / Company" }],
        },
      },
    );

    const invalid = await MigrationRecord.findOne({ batchId: batch._id, status: "invalid" }).lean();
    const { fixMigrationRecordWithAi } = await import("@/lib/migration/aiFix");
    const result = await fixMigrationRecordWithAi(String(batch._id), TENANT, String(invalid?._id));
    expect(result.fixed).toBe(false);

    const record = await MigrationRecord.findById(invalid?._id).lean();
    expect(record?.status).toBe("invalid");
    expect(record?.errors?.[0]?.message).toBe("Missing required field: Name / Company");
  });

  it("revalidates stale journal account import failures through Fix All without calling AI", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });
    const job = await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.JOURNAL_ENTRY,
      "Journal Lines.xlsx",
      { journalId: "journal_id", journalDate: "journal_date", status: "status", linesJson: "lines_json" },
      [{
        journal_id: "JE-STALE-ACCOUNT-ERROR",
        journal_date: "2026-03-31",
        status: "Posted",
        lines_json: JSON.stringify([
          { line_no: 1, account_code: "6600", debit_inr: 100, credit_inr: 0 },
          { line_no: 2, account_code: "4100", debit_inr: 0, credit_inr: 100 },
        ]),
      }],
    );
    const record = await MigrationRecord.findOne({ batchId: batch._id, jobId: job._id });
    await MigrationRecord.updateOne(
      { _id: record?._id },
      { $set: { status: "invalid", errors: [{ message: "Missing account code '6600' for journal 'JE-STALE-ACCOUNT-ERROR'." }] } },
    );

    const { fixMigrationRecordWithAi } = await import("@/lib/migration/aiFix");
    const result = await fixMigrationRecordWithAi(String(batch._id), TENANT, String(record?._id));
    expect(result.fixed).toBe(true);
    expect(result.aiUsed).toBe(false);

    await runWorkerUntilDone(String(batch._id));
    const refreshed = await MigrationRecord.findById(record?._id).lean();
    expect(refreshed?.status).toBe("invalid");
    expect(refreshed?.errors?.[0]?.message).toMatch(/Missing account code '6600'.*before starting migration/i);
  });

  it("repairs negative product quantities after an explicit automatic fix", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "preview",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "MD_V3.xlsx - Products",
      { sourceId: "Item Code", sku: "SKU", name: "Item Description", stockQuantity: "Stock Qty" },
      [{ "Item Code": "ITMV3-61032", SKU: "SKU-V3-73032", "Item Description": "Nexus Conference Mic", "Stock Qty": "-15" }],
    );

    await MigrationRecord.updateOne(
      { batchId: batch._id, jobId: job._id },
      {
        $set: {
          status: "invalid",
          mappedData: { sourceId: "ITMV3-61032", sku: "SKU-V3-73032", name: "Nexus Conference Mic", stockQuantity: "-15" },
          errors: [{ message: "Product stock quantity cannot be negative." }],
        },
      },
    );

    const invalid = await MigrationRecord.findOne({ batchId: batch._id, status: "invalid" }).lean();
    const { fastFixMigrationRecord } = await import("@/lib/migration/aiFix");
    const result = await fastFixMigrationRecord(String(batch._id), TENANT, String(invalid?._id));
    expect(result.fixed).toBe(true);

    await runWorkerUntilDone(String(batch._id));

    const record = await MigrationRecord.findOne({ batchId: batch._id }).lean();
    expect(record?.status).toBe("valid");
    expect(record?.mappedData?.stockQuantity).toBe("0");
  });

  it("preserves payments with missing invoice history as unapplied receipts", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PAYMENT,
      "MD_V3.xlsx - Payments",
      { sourceId: "Payment Ref", invoiceSourceId: "Invoice No", type: "Payment Mode", reference: "Reference No", amount: "Amount", date: "Payment Date" },
      [{ "Payment Ref": "PAY-V3-95054", "Invoice No": "INV-V3-99999", "Payment Date": "2026-05-28", "Payment Mode": "Cheque", "Reference No": "REF-330054", Amount: "4389.15", Status: "Cleared" }],
    );

    await runWorkerUntilDone(String(batch._id));

    const record = await MigrationRecord.findOne({ batchId: batch._id }).lean();
    expect(record?.status).toBe("valid");
    expect(record?.errors).toEqual([]);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 1 } });
    await runWorkerUntilDone(String(batch._id));

    const payment = await Payment.findOne({ tenantId: TENANT, paymentNumber: "PAY-V3-95054" }).lean();
    expect(payment?.amountReceived).toBe(4389.15);
    expect(payment?.unusedAmount).toBe(4389.15);
    expect(payment?.allocations).toEqual([]);
  });

  it("validates and migrates the simple root employee/product workbook without false product duplicates", async () => {
    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 2,
      totalRecords: 4,
      totalModules: 2,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.EMPLOYEE,
      "Aupulens_Employee_Product_Migration_Test_Data.xlsx - Employees",
      {
        employeeId: "Employee ID",
        firstName: "Employee Name",
        email: "Email",
        phone: "Phone",
        department: "Department",
        designation: "Designation",
        joiningDate: "Joining Date",
        status: "Status",
      },
      [
        { "Employee ID": "EMP001", "Employee Name": "Arjun Menon", Email: "arjun.menon@example.com", Phone: "9000000001", Department: "Engineering", Designation: "Software Engineer", "Joining Date": "2025-01-15", Status: "Active" },
        { "Employee ID": "EMP002", "Employee Name": "Meera Nair", Email: "meera.nair@example.com", Phone: "9000000002", Department: "Engineering", Designation: "Frontend Developer", "Joining Date": "2025-02-10", Status: "Active" },
      ],
    );
    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.PRODUCT,
      "Aupulens_Employee_Product_Migration_Test_Data.xlsx - Products",
      {
        sku: "Product ID",
        name: "Product Name",
        category: "Category",
        subcategory: "Subcategory",
        brand: "Brand",
        salesPrice: "Unit Price",
        stockQuantity: "Stock Quantity",
        status: "Status",
      },
      [
        { "Product ID": "PRD001", "Product Name": "Aupulens Laptop Pro 14", Category: "Electronics", Subcategory: "Laptop", Brand: "Dell", "Unit Price": "34999.00", "Stock Quantity": "50", Status: "Active" },
        { "Product ID": "PRD002", "Product Name": "Aupulens Laptop Pro 15", Category: "Electronics", Subcategory: "Laptop", Brand: "HP", "Unit Price": "42999.00", "Stock Quantity": "35", Status: "Active" },
      ],
    );

    await runWorkerUntilDone(String(batch._id));

    const statuses = await MigrationRecord.find({ batchId: batch._id }).select("entityType status mappedData duplicateReason duplicateFields").lean();
    expect(statuses.map((record) => record.status)).toEqual(["valid", "valid", "valid", "valid"]);
    expect(statuses.filter((record) => record.entityType === MIGRATION_ENTITY.PRODUCT).map((record: any) => record.mappedData.sku)).toEqual(["PRD001", "PRD002"]);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

    expect(await Employee.countDocuments({ tenantId: TENANT })).toBe(2);
    expect(await Product.countDocuments({ tenantId: TENANT })).toBe(2);

    const product = await Product.findOne({ tenantId: TENANT, "tab_general_information.default_code": "PRD001" }).lean();
    expect(product?.header.name).toBe("Aupulens Laptop Pro 14");
    expect(product?.tab_general_information.list_price).toBe(34999);

    const employee = await Employee.findOne({ tenantId: TENANT, employeeCode: "EMP001" }).lean();
    expect(employee?.firstName).toBe("Arjun");
    expect(employee?.lastName).toBe("Menon");
    expect(employee?.designation).toBe("Software Engineer");
  });

  it("flags an existing employee code before migration even when the uploaded email is different", async () => {
    await Employee.create({
      tenantId: TENANT,
      employeeCode: "EMP009",
      firstName: "Existing",
      lastName: "Employee",
      email: "existing.emp009@example.com",
      phone: "9000009999",
      dateOfJoining: new Date("2024-01-01"),
      employmentType: "full-time",
      lifecycleStatus: "active",
      status: "active",
      createdBy: USER_ID,
    });

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.EMPLOYEE,
      "employees.xlsx - Employees",
      {
        employeeId: "Employee ID",
        firstName: "Employee Name",
        email: "Email",
        phone: "Phone",
        department: "Department",
        designation: "Designation",
        joiningDate: "Joining Date",
        status: "Status",
      },
      [
        { "Employee ID": "EMP009", "Employee Name": "Akshay Nair", Email: "akshay.nair@example.com", Phone: "9000000009", Department: "Engineering", Designation: "QA Engineer", "Joining Date": "2025-06-15", Status: "Active" },
      ],
    );

    await runWorkerUntilDone(String(batch._id));

    const record = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.EMPLOYEE }).lean();
    expect(record?.status).toBe("duplicate");
    expect(record?.duplicateReason).toBe("database");
    expect(record?.duplicateFields).toEqual(["email", "employeeId"]);
    expect(record?.duplicateTargetId).toBeTruthy();
  });

  it("force creates an employee duplicate with an import-safe employee code and email", async () => {
    await Employee.create({
      tenantId: TENANT,
      employeeCode: "EMP009",
      firstName: "Existing",
      lastName: "Employee",
      email: "existing.emp009@example.com",
      phone: "9000009999",
      dateOfJoining: new Date("2024-01-01"),
      employmentType: "full-time",
      lifecycleStatus: "active",
      status: "active",
      createdBy: USER_ID,
    });

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.EMPLOYEE,
      "employees.xlsx - Employees",
      {
        employeeId: "Employee ID",
        firstName: "Employee Name",
        email: "Email",
        phone: "Phone",
        designation: "Designation",
        joiningDate: "Joining Date",
        status: "Status",
      },
      [
        { "Employee ID": "EMP009", "Employee Name": "Akshay Nair", Email: "akshay.nair@example.com", Phone: "9000000009", Designation: "QA Engineer", "Joining Date": "2025-06-15", Status: "Active" },
      ],
    );

    await runWorkerUntilDone(String(batch._id));

    const duplicate = await MigrationRecord.findOne({ batchId: batch._id, entityType: MIGRATION_ENTITY.EMPLOYEE });
    expect(duplicate?.status).toBe("duplicate");
    duplicate!.duplicateAction = "create";
    await duplicate!.save();

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

    expect(await Employee.countDocuments({ tenantId: TENANT })).toBe(2);
    const forced = await Employee.findOne({ tenantId: TENANT, employeeCode: /^EMP009-MIG-/ }).lean();
    expect(forced?.employeeCode).toMatch(/^EMP009-MIG-/);
    expect(forced?.email).toMatch(/^akshay\.nair\+mig-[a-f0-9]{6}@example\.com$/i);
    expect(forced?.email).not.toBe("akshay.nair@example.com");
  });

  it("skips an employee duplicate without creating another employee", async () => {
    await Employee.create({
      tenantId: TENANT,
      employeeCode: "EMP010",
      firstName: "Sneha",
      lastName: "Varghese",
      email: "sneha.varghese@northstar-demo.example",
      phone: "9746123488",
      dateOfJoining: new Date("2022-11-21"),
      employmentType: "full-time",
      lifecycleStatus: "active",
      status: "active",
      createdBy: USER_ID,
    });

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "running",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await createJobWithRecords(
      batch._id,
      MIGRATION_ENTITY.EMPLOYEE,
      "employees.xlsx - Employees",
      {
        employeeId: "Employee ID",
        firstName: "First Name",
        lastName: "Last Name",
        email: "Email",
        phone: "Phone",
        department: "Department",
        designation: "Designation",
        joiningDate: "Joining Date",
        status: "Status",
      },
      [
        {
          "Employee ID": "MIG-3E836A5C",
          "First Name": "Sneha",
          "Last Name": "Varghese",
          Email: "sneha.varghese@northstar-demo.example",
          Phone: "9746123488",
          Department: "Human Resources",
          Designation: "HR Executive",
          "Joining Date": "2022-11-21",
          Status: "Active",
        },
      ],
    );

    const duplicate = await MigrationRecord.findOne({ batchId: batch._id, jobId: job._id });
    duplicate!.status = "duplicate";
    duplicate!.duplicateAction = "skip";
    duplicate!.duplicateReason = "database";
    duplicate!.duplicateFields = ["email"];
    await duplicate!.save();

    await runWorkerUntilDone(String(batch._id));

    expect(await Employee.countDocuments({ tenantId: TENANT })).toBe(1);
    expect(await Employee.countDocuments({ tenantId: TENANT, email: "sneha.varghese@northstar-demo.example" })).toBe(1);
    const skipped = await MigrationRecord.findById(duplicate!._id).lean();
    expect(skipped?.status).toBe("skipped");
    expect(skipped?.targetRecordId).toBeUndefined();
  });

  it("creates imported departments with collision-safe codes", async () => {
    const salesId = await ensureDepartmentForTenant(TENANT, "Sales", String(USER_ID));
    const supportId = await ensureDepartmentForTenant(TENANT, "Support", String(USER_ID));

    expect(String(salesId)).not.toBe(String(supportId));
    const departments = await Department.find({ tenantId: TENANT, name: { $in: ["Sales", "Support"] } }).select("name code").lean();
    expect(departments.map((department) => department.name).sort()).toEqual(["Sales", "Support"]);
    expect(new Set(departments.map((department) => department.code)).size).toBe(2);
  });

  it("updates an existing employee instead of failing when a valid row reuses employee code", async () => {
    await Employee.create({
      tenantId: TENANT,
      employeeCode: "EMPX2601",
      firstName: "Existing",
      lastName: "Employee",
      email: "existing.empx2601@example.com",
      phone: "9000009999",
      dateOfJoining: new Date("2024-01-01"),
      employmentType: "full-time",
      lifecycleStatus: "active",
      status: "active",
      createdBy: USER_ID,
    });

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "running",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await MigrationJob.create({
      tenantId: TENANT,
      batchId: batch._id,
      name: "employees.xlsx - Employees",
      sourceSystem: "excel",
      entityType: MIGRATION_ENTITY.EMPLOYEE,
      status: MIGRATION_JOB_STATUS.MAPPED,
      fileName: "employees.xlsx",
      columns: ["Employee ID", "Employee Name", "Email", "Phone", "Joining Date"],
      totalRows: 1,
      mapping: {
        employeeId: "Employee ID",
        firstName: "Employee Name",
        email: "Email",
        phone: "Phone",
        joiningDate: "Joining Date",
      },
      importedRefs: [],
      createdBy: USER_ID,
    });

    await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: job._id,
      entityType: MIGRATION_ENTITY.EMPLOYEE,
      sourceData: { "Employee ID": "EMPX2601", "Employee Name": "Aadvik Acharya", Email: "aadvik@example.com", Phone: "8100000001", "Joining Date": "2022-01-03" },
      mappedData: { employeeId: "EMPX2601", firstName: "Aadvik Acharya", email: "aadvik@example.com", phone: "8100000001", joiningDate: "2022-01-03" },
      status: "valid",
    });

    await runWorkerUntilDone(String(batch._id));

    const finalBatch = await MigrationBatch.findById(batch._id).lean();
    expect(finalBatch?.status).toBe("verified");

    const record = await MigrationRecord.findOne({ batchId: batch._id }).lean();
    expect(record?.status).toBe("migrated");
    expect(await Employee.countDocuments({ tenantId: TENANT })).toBe(1);
    const employee = await Employee.findOne({ tenantId: TENANT, employeeCode: "EMPX2601" }).lean();
    expect(employee?.firstName).toBe("Aadvik");
    expect(employee?.lastName).toBe("Acharya");
    expect(employee?.email).toBe("aadvik@example.com");
  });

  it("updates an existing product instead of creating a duplicate when SKU already exists", async () => {
    await Product.create({
      tenantId: TENANT,
      createdBy: USER_ID,
      header: { name: "Thermal Receipt Printer", sale_ok: true, purchase_ok: true, can_be_expensed: false },
      tab_general_information: { type: "consu", default_code: "AUP-PRD-202", list_price: 6450, standard_price: 0 },
      status: "published",
    });

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "running",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await MigrationJob.create({
      tenantId: TENANT,
      batchId: batch._id,
      name: "MD_V2.xlsx - Product Master",
      sourceSystem: "excel",
      entityType: MIGRATION_ENTITY.PRODUCT,
      status: MIGRATION_JOB_STATUS.MAPPED,
      fileName: "MD_V2.xlsx",
      columns: ["Product Code", "Product Name", "Selling Price"],
      totalRows: 1,
      mapping: { sourceId: "Product Code", name: "Product Name", salesPrice: "Selling Price" },
      importedRefs: [],
      createdBy: USER_ID,
    });

    await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: job._id,
      entityType: MIGRATION_ENTITY.PRODUCT,
      sourceData: { "Product Code": "AUP-PRD-202", "Product Name": "Thermal Receipt Printer", "Selling Price": 6450 },
      mappedData: { sourceId: "AUP-PRD-202", sku: "AUP-PRD-202", name: "Thermal Receipt Printer", salesPrice: "6450" },
      status: "valid",
    });

    await runWorkerUntilDone(String(batch._id));

    const finalBatch = await MigrationBatch.findById(batch._id).lean();
    expect(finalBatch?.status).toBe("verified");

    const record = await MigrationRecord.findOne({ batchId: batch._id }).lean();
    expect(record?.status).toBe("migrated");
    expect(await Product.countDocuments({ tenantId: TENANT, "tab_general_information.default_code": "AUP-PRD-202" })).toBe(1);
    const product = await Product.findOne({ tenantId: TENANT, "tab_general_information.default_code": "AUP-PRD-202" }).lean();
    expect(product?.tab_general_information.list_price).toBe(6450);
  });

  it("removes existing duplicate products during migration and keeps one product per SKU", async () => {
    await Product.create([
      {
        tenantId: TENANT,
        createdBy: USER_ID,
        header: { name: "Thermal Receipt Printer", sale_ok: true, purchase_ok: true, can_be_expensed: false },
        tab_general_information: { type: "consu", default_code: "AUP-PRD-202", list_price: 6000, standard_price: 0 },
        status: "published",
      },
      {
        tenantId: TENANT,
        createdBy: USER_ID,
        header: { name: "Thermal Receipt Printer", sale_ok: true, purchase_ok: true, can_be_expensed: false },
        tab_general_information: { type: "consu", default_code: "AUP-PRD-202", list_price: 6450, standard_price: 0 },
        status: "published",
      },
    ]);

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "running",
      createdBy: USER_ID,
      totalFiles: 1,
      totalRecords: 1,
      totalModules: 1,
    });

    const job = await MigrationJob.create({
      tenantId: TENANT,
      batchId: batch._id,
      name: "MD_V2.xlsx - Product Master",
      sourceSystem: "excel",
      entityType: MIGRATION_ENTITY.PRODUCT,
      status: MIGRATION_JOB_STATUS.MAPPED,
      fileName: "MD_V2.xlsx",
      columns: ["Product Code", "Product Name", "Selling Price"],
      totalRows: 1,
      mapping: { sourceId: "Product Code", name: "Product Name", salesPrice: "Selling Price" },
      importedRefs: [],
      createdBy: USER_ID,
    });

    await MigrationRecord.create({
      tenantId: TENANT,
      batchId: batch._id,
      jobId: job._id,
      entityType: MIGRATION_ENTITY.PRODUCT,
      sourceData: { "Product Code": "AUP-PRD-202", "Product Name": "Thermal Receipt Printer", "Selling Price": 7000 },
      mappedData: { sourceId: "AUP-PRD-202", sku: "AUP-PRD-202", name: "Thermal Receipt Printer", salesPrice: "7000" },
      status: "valid",
    });

    await runWorkerUntilDone(String(batch._id));

    expect(await Product.countDocuments({ tenantId: TENANT, "tab_general_information.default_code": "AUP-PRD-202" })).toBe(1);
    const product = await Product.findOne({ tenantId: TENANT, "tab_general_information.default_code": "AUP-PRD-202" }).lean();
    expect(product?.tab_general_information.list_price).toBe(7000);
  });

  itIfFile("MD_V2.xlsx")("validates and migrates the MD_V2 workbook end to end without product duplicates", async () => {
    const prepared = prepareMigrationFiles(
      [{ name: "MD_V2.xlsx", buffer: fs.readFileSync("MD_V2.xlsx") }],
      "excel",
    );

    const batch = await MigrationBatch.create({
      tenantId: TENANT,
      sourceSystem: "excel",
      status: "validating",
      createdBy: USER_ID,
      totalFiles: prepared.length,
      totalRecords: prepared.reduce((sum, file) => sum + file.rows.length, 0),
      totalModules: prepared.length,
    });

    for (const file of prepared) {
      const schema = getEntitySchema(file.entityType)!;
      await createJobWithRecords(
        batch._id,
        file.entityType,
        file.name,
        deterministicMapping(schema, file.columns),
        file.rows,
      );
    }

    await runWorkerUntilDone(String(batch._id));
    const statuses = await MigrationRecord.find({ batchId: batch._id }).select("status").lean();
    expect(statuses.every((record) => record.status === "valid")).toBe(true);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

    expect(await Employee.countDocuments({ tenantId: TENANT })).toBe(20);
    expect(await Department.countDocuments({ tenantId: TENANT })).toBeGreaterThan(0);
    const employee = await Employee.findOne({ tenantId: TENANT, employeeCode: "AUP-EMP-101" })
      .populate("departmentId", "name")
      .lean();
    expect((employee?.departmentId as any)?.name).toBe("Product");
    expect(await Product.countDocuments({ tenantId: TENANT })).toBe(20);
    expect(await Product.countDocuments({ tenantId: TENANT, "tab_general_information.default_code": "AUP-PRD-202" })).toBe(1);
    const product = await Product.findOne({ tenantId: TENANT, "tab_general_information.default_code": "AUP-PRD-202" }).lean();
    expect(product?.header.name).toBe("Thermal Receipt Printer");
    expect(product?.tab_general_information.list_price).toBe(6450);
  });
});

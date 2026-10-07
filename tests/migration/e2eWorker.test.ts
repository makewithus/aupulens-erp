import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import fs from "fs";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_migration_e2e_worker";

import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import { MIGRATION_ENTITY, MIGRATION_JOB_STATUS } from "@/lib/migration/constants";
import { processMigrationWorker } from "@/lib/migration/worker";
import { prepareMigrationFiles } from "@/lib/migration/package";
import { deterministicMapping } from "@/lib/migration/deterministicMapping";
import { getEntitySchema } from "@/lib/migration/entitySchemas";
import { ensureDepartmentForTenant } from "@/lib/migration/employeeDepartmentSync";
import { unresolvedDuplicateFilter } from "@/lib/migration/duplicateResolution";
import { computeMigrationReviewSummary } from "@/lib/migration/summary";

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
    await Employee.init();
    await SalesInvoice.init();
    await Payment.init();
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
    await Employee.deleteMany({ tenantId: TENANT });
    await (SalesInvoice as any).deleteMany({ tenantId: TENANT });
    await Payment.deleteMany({ tenantId: TENANT });
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

  it("force creates an employee duplicate with an import-safe employee code", async () => {
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
    const forced = await Employee.findOne({ tenantId: TENANT, email: "akshay.nair@example.com" }).lean();
    expect(forced?.employeeCode).toMatch(/^EMP009-MIG-/);
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

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_migration_e2e_worker";

import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationIdentityMap from "@/models/admin/MigrationIdentityMap";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import { MIGRATION_ENTITY, MIGRATION_JOB_STATUS } from "@/lib/migration/constants";
import { processMigrationWorker } from "@/lib/migration/worker";

const TENANT = "tenant-migration-e2e";
const USER_ID = new mongoose.Types.ObjectId();

async function runWorkerUntilDone(batchId: string) {
  let result = { done: false, processed: 0 };
  for (let i = 0; i < 20 && !result.done; i++) {
    result = await processMigrationWorker(batchId, 2);
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

    await runWorkerUntilDone(String(batch._id));

    const previewBatch = await MigrationBatch.findById(batch._id).lean();
    expect(previewBatch?.status).toBe("preview");
    expect(await Customer.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await Product.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await SalesInvoice.countDocuments({ tenantId: TENANT })).toBe(0);
    expect(await Payment.countDocuments({ tenantId: TENANT })).toBe(0);

    await MigrationBatch.updateOne({ _id: batch._id }, { $set: { status: "running", progress: 0 } });
    await runWorkerUntilDone(String(batch._id));

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

    const receipt = await Payment.findOne({ tenantId: TENANT, paymentNumber: "RCPT-001" }).lean();
    expect(String(receipt?.customerId)).toBe(String(customer?._id));
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
    expect(customerStatuses.some((record) => record.errors?.[0]?.message === "Duplicate record found in uploaded data.")).toBe(true);

    const lineStatuses = await MigrationRecord.find({
      batchId: batch._id,
      entityType: MIGRATION_ENTITY.INVOICE_ITEM,
    }).select("status").lean();
    expect(lineStatuses.map((record) => record.status)).toEqual(["valid", "valid"]);
  });
});

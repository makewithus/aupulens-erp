import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { SalesInvoice as SalesInvoiceModel } from "@/models/SalesInvoice";

const SalesInvoice: any = SalesInvoiceModel;

describe("SalesInvoice model", () => {
  const customerId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_sales_invoice");
    await SalesInvoice.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await SalesInvoice.deleteMany({});
  });

  const baseDoc = (overrides: Partial<Record<string, any>> = {}) => ({
    tenantId: "t1",
    number: "INV-0001",
    customerId,
    lineItems: [{ name: "Widget", qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 18, lineTotal: 118 }],
    taxableAmount: 100,
    totalAmount: 118,
    ...overrides,
  });

  it("creates a valid invoice with default status draft", async () => {
    const doc = await SalesInvoice.create(baseDoc());
    expect(doc.status).toBe("draft");
    expect(doc.templateKey).toBe("modern");
  });

  it("enforces a compound unique index on (tenantId, number)", async () => {
    await SalesInvoice.create(baseDoc());
    await expect(SalesInvoice.create(baseDoc())).rejects.toThrow(/E11000/);
  });

  it("allows the same invoice number across different tenants", async () => {
    await SalesInvoice.create(baseDoc({ tenantId: "t1" }));
    const other = await SalesInvoice.create(baseDoc({ tenantId: "t2" }));
    expect(other.tenantId).toBe("t2");
  });

  it("isolates queries by tenantId", async () => {
    await SalesInvoice.create(baseDoc({ tenantId: "t1", number: "INV-0001" }));
    await SalesInvoice.create(baseDoc({ tenantId: "t2", number: "INV-0002" }));

    const t1Invoices = await SalesInvoice.find({ tenantId: "t1" }).lean();
    const t2Invoices = await SalesInvoice.find({ tenantId: "t2" }).lean();

    expect(t1Invoices).toHaveLength(1);
    expect(t2Invoices).toHaveLength(1);
    expect(t1Invoices[0].number).toBe("INV-0001");
  });

  it("stores line item discount mode and computed totals as provided", async () => {
    const doc = await SalesInvoice.create(
      baseDoc({
        lineItems: [{ name: "Service", qty: 2, unitPrice: 500, discount: 50, discountMode: "amount", taxRate: 18, lineTotal: 1121 }],
        totalDiscount: 50,
      }),
    );
    expect(doc.lineItems[0].discountMode).toBe("amount");
    expect(doc.totalDiscount).toBe(50);
  });

  it("rejects an invalid status enum value", async () => {
    await expect(SalesInvoice.create(baseDoc({ status: "not_a_real_status" }))).rejects.toThrow();
  });
});

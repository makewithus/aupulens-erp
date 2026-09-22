import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_pipeline_deals";

import Customer from "@/models/sales/Customer";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import JournalEntry from "@/models/finance/JournalEntry";
import { listDeals, transitionDeal, DealError } from "@/lib/sales/pipelineDeals";

const T = "t-pipeline-deals";
const userId = String(new mongoose.Types.ObjectId());

async function customer() {
  return Customer.create({ tenantId: T, header: { name: "Acme", displayName: "Acme", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
}

describe("Q2C deals: one record, stage-aware document reference", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Customer.init(), SaleOrder.init(), SalesQuotation.init(), SalesInvoice.init(), JournalEntry.init()]);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });
  afterEach(async () => {
    await Promise.all([Customer, SaleOrder, SalesQuotation, SalesInvoice, JournalEntry].map((m: any) => m.deleteMany({ tenantId: T })));
  });

  it("SO deal changes displayed ref SO -> QT -> SO -> INV, keeps history, preserves the amount", async () => {
    const c = await customer();
    const so: any = await SaleOrder.create({
      tenantId: T,
      header: { name: "SO-000015", partnerId: c._id },
      orderLines: [{ name: "Widget", productQty: 2, priceUnit: 1000, discount: 10, discountMode: "percent", taxRate: 18, priceSubtotal: 2124 }],
      totals: { amountUntaxed: 1800, amountTax: 324, amountTotal: 2124 },
    });
    const id = String(so._id);
    const refAt = async () => (await listDeals(T)).find((d) => d._id === id)!;

    for (const to of ["opportunity", "price_applied"]) await transitionDeal({ tenantId: T, userId, kind: "order", id, to });
    expect((await refAt()).header.name).toBe("SO-000015");

    await transitionDeal({ tenantId: T, userId, kind: "order", id, to: "quote_generated" });
    const atQuote = await refAt();
    expect(atQuote.header.name).toMatch(/^QUO?-/);
    expect(atQuote.docType).toBe("QT");
    expect(atQuote.viewHref).toMatch(/^\/sales\/quotes\//);

    await transitionDeal({ tenantId: T, userId, kind: "order", id, to: "quote_accepted" });
    expect((await refAt()).header.name).toBe("SO-000015");

    for (const to of ["sales_order", "fulfillment", "invoice_posted"]) await transitionDeal({ tenantId: T, userId, kind: "order", id, to });
    const final = await refAt();
    expect(final.docType).toBe("INV");
    expect(final.header.name).toMatch(/^INV/);
    expect(final.totals.amountTotal).toBe(2124);
    expect(final.refHistory.map((h: any) => h.docType)).toEqual(["SO", "QT", "SO", "INV"]);

    const invoices = await (SalesInvoice as any).find({ tenantId: T }).lean();
    expect(invoices).toHaveLength(1);
    expect(invoices[0].totalAmount).toBe(2124);
  });

  it("a quote shows on the board, and moving it to a sales order creates the SO after the quote", async () => {
    const c = await customer();
    const q: any = await SalesQuotation.create({
      tenantId: T, quoteNumber: "QT-1", customerId: c._id,
      lineItems: [{ name: "Svc", qty: 1, unitPrice: 5000, discount: 0, discountMode: "percent", taxRate: 18, lineTotal: 0 }],
      taxableAmount: 5000, totalAmount: 5900, createdBy: new mongoose.Types.ObjectId(),
    });
    const before = await listDeals(T);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ kind: "quote", q2cStatus: "quote_generated" });
    expect(await SaleOrder.countDocuments({ tenantId: T })).toBe(0);

    await transitionDeal({ tenantId: T, userId, kind: "quote", id: String(q._id), to: "quote_accepted" });
    const res = await transitionDeal({ tenantId: T, userId, kind: "quote", id: String(q._id), to: "sales_order" });
    expect(res.kind).toBe("order");
    const after = await listDeals(T);
    expect(after).toHaveLength(1); // quote card replaced by the SO deal, not duplicated
    expect(after[0].refHistory.map((h: any) => h.ref)[0]).toBe("QT-1");
    expect(after[0].totals.amountTotal).toBe(5900);
  });

  it("rejects an illegal jump with a plain-language error", async () => {
    const c = await customer();
    const so: any = await SaleOrder.create({ tenantId: T, header: { name: "SO-9", partnerId: c._id }, orderLines: [], totals: { amountTotal: 0 } });
    await expect(transitionDeal({ tenantId: T, userId, kind: "order", id: String(so._id), to: "fulfillment" })).rejects.toBeInstanceOf(DealError);
  });

  it("refuses to invoice a zero-value deal instead of creating a ₹0 invoice", async () => {
    const c = await customer();
    const so: any = await SaleOrder.create({ tenantId: T, header: { name: "SO-10", partnerId: c._id }, orderLines: [], totals: { amountTotal: 0 }, q2cStatus: "fulfillment" });
    await expect(transitionDeal({ tenantId: T, userId, kind: "order", id: String(so._id), to: "invoice_posted" })).rejects.toThrow(/₹0/);
    expect(await (SalesInvoice as any).countDocuments({ tenantId: T })).toBe(0);
  });
  it("legacy record with salesInvoiceIds but no cached invoiceNumber shows the real INV ref, not the stale quote/SO name", async () => {
    const c = await customer();
    const invoice: any = await SalesInvoice.create({
      tenantId: T, number: "INV-LEGACY-1", customerId: c._id,
      lineItems: [{ name: "X", qty: 1, unitPrice: 100, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 100 }],
      taxableAmount: 100, totalAmount: 100, createdBy: new mongoose.Types.ObjectId(),
    });
    // Mirrors the pre-fix sync: header.name was set to the quote number, and
    // invoiceNumber was never populated even though the order was invoiced.
    const legacy: any = await SaleOrder.create({
      tenantId: T,
      header: { name: "QUO-000030", partnerId: c._id },
      orderLines: [],
      totals: { amountTotal: 100 },
      q2cStatus: "invoice_posted",
      salesInvoiceIds: [invoice._id],
    });

    const deal = (await listDeals(T, userId)).find((d) => d._id === String(legacy._id))!;
    expect(deal.docType).toBe("INV");
    expect(deal.header.name).toBe("INV-LEGACY-1");
    expect(deal.viewHref).toBe(`/sales/invoices/${invoice._id}`);
  });

  it("a deal that reached Invoice Posted with NO invoice at all gets one auto-generated on load", async () => {
    const c = await customer();
    const stray: any = await SaleOrder.create({
      tenantId: T,
      header: { name: "SO-STRAY-1", partnerId: c._id },
      orderLines: [{ name: "Widget", productQty: 1, priceUnit: 500, priceSubtotal: 500 }],
      totals: { amountTotal: 500 },
      q2cStatus: "invoice_posted",
    });

    expect(await SalesInvoice.countDocuments({ tenantId: T })).toBe(0);
    const deal = (await listDeals(T, userId)).find((d) => d._id === String(stray._id))!;
    expect(deal.docType).toBe("INV");
    expect(deal.header.name).toMatch(/^INV/);
    expect(deal.viewHref).toMatch(/^\/sales\/invoices\/[a-f0-9]{24}$/); // not "[object Object]"
    expect(await SalesInvoice.countDocuments({ tenantId: T })).toBe(1);

    const saved: any = await SaleOrder.findById(stray._id).lean();
    expect(saved.invoiceNumber).toBe(deal.header.name);
    expect(saved.salesInvoiceIds).toHaveLength(1);

    // Reloading the board doesn't create a second invoice.
    await listDeals(T, userId);
    expect(await SalesInvoice.countDocuments({ tenantId: T })).toBe(1);
  });

  it("without a userId, the board still displays correctly but never creates anything", async () => {
    const c = await customer();
    const stray: any = await SaleOrder.create({
      tenantId: T,
      header: { name: "SO-STRAY-2", partnerId: c._id },
      orderLines: [{ name: "Widget", productQty: 1, priceUnit: 500, priceSubtotal: 500 }],
      totals: { amountTotal: 500 },
      q2cStatus: "invoice_posted",
    });
    const deal = (await listDeals(T)).find((d) => d._id === String(stray._id))!;
    expect(deal.docType).toBe("SO"); // no invoice exists yet, so it falls back honestly
    expect(await SalesInvoice.countDocuments({ tenantId: T, customerId: c._id })).toBe(0);
  });
});

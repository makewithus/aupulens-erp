import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/aupulens_test_qa_gst";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
import Warehouse from "@/models/inventory/Warehouse";
import Product from "@/models/inventory/Product";
import Customer from "@/models/sales/Customer";
import Organization from "@/models/admin/Organization";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Invoice from "@/models/finance/Invoice";
import JournalEntry from "@/models/finance/JournalEntry";
import Account from "@/models/finance/Account";
import Counter from "@/models/shared/Counter";
import TaxRate from "@/models/finance/TaxRate";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { ensureDefaultTdsTcsRates } from "@/lib/accounting/taxRate-seeder";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { calculateGstSetoff, splitGst } from "@/lib/accounting/gst";
import { computeBillTotals } from "@/lib/accounting/billMath";
import { postSalesInvoiceJournal } from "@/lib/accounting/salesInvoicePosting";
import { getGstLedger, postGstSetoff } from "@/lib/accounting/gstLedger";
import { convertQuoteToInvoice } from "@/lib/sales/quoteInvoice";
import { createInvoiceForOrder } from "@/lib/sales/pipelineDeals";
const tenantId = "qa-gst", userId = String(new mongoose.Types.ObjectId());
const request = (url: string, body?: any) => new NextRequest(`http://localhost${url}`, body ? { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : undefined);
let customer: any;
const line = { name: "Watch", qty: 1, unitPrice: 1000, discount: 10, discountMode: "percent" as const, taxRate: 18 };
async function quote() {
  return SalesQuotation.create({ tenantId, quoteNumber: `Q-${Math.random()}`, customerId: customer._id, lineItems: [line], taxableAmount: 900, totalDiscount: 100, totalAmount: 1062, createdBy: userId, status: "accepted" });
}
describe("QA GST and inventory/sales regression", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Warehouse, Product, Customer, Organization, ManufacturingOrder, SaleOrder, SalesQuotation, SalesInvoice, Invoice, JournalEntry, Account, Counter, TaxRate].map((m: any) => m.init()));
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  afterEach(async () => { await Promise.all([Warehouse, Product, Customer, Organization, ManufacturingOrder, SaleOrder, SalesQuotation, SalesInvoice, Invoice, JournalEntry, Account, Counter, TaxRate].map((m: any) => m.deleteMany({}))); vi.restoreAllMocks(); });
  async function setup() {
    vi.mocked(auth).mockResolvedValue({ user: { id: userId, tenantId, role: "admin" } } as any);
    customer = await Customer.create({ tenantId, header: { name: "QA customer" }, address_tab: { state_name: "Maharashtra" }, createdBy: userId });
    await Organization.create({ name: "QA", subdomain: tenantId, ownerUserId: userId, settings: { state: "Maharashtra" } });
    await ensureChartOfAccounts(tenantId, userId);
  }
  it("saves warehouse with the screenshot's blank optional fields and returns friendly duplicate error", async () => {
    await setup(); const { POST } = await import("@/app/api/inventory/warehouse/route");
    const body = { name: "BMW WAREHOUSE", warehouseCode: "WH-001", type: "standard", status: "active", capacity: 1000, address: "", location: "" };
    expect((await POST(request("/api/inventory/warehouse", body))).status).toBe(201);
    expect((await POST(request("/api/inventory/warehouse", body))).status).toBe(409);
    expect((await Warehouse.findOne({ tenantId }))?.capacity).toBe(1000);
  });
  it("inventory product is published and its 18% GST survives readback; explicit Sales drafts survive", async () => {
    await setup(); const { POST, GET } = await import("@/app/api/sales/products/route");
    const body = { header: { name: "Watch" }, tab_general_information: { type: "service", list_price: 1000, gstRate: 18 }, status: "published" };
    expect((await POST(request("/api/sales/products", body))).status).toBe(201);
    const result = await (await GET(request("/api/sales/products?status=published"))).json();
    expect(result.items).toHaveLength(1); expect(result.items[0].tab_general_information.gstRate).toBe(18);
    const draft = await (await POST(request("/api/sales/products", { ...body, status: "draft" }))).json();
    expect(draft.product.status).toBe("draft");
    expect((await POST(request("/api/sales/products", { ...body, tab_general_information: { gstRate: -1 } }))).status).toBe(400);
  });
  it("manufacturing summary excludes another tenant's orders", async () => {
    await setup(); await ManufacturingOrder.create({ tenantId: "another", header: { name: "MO-OTHER", productId: new mongoose.Types.ObjectId(), quantity: 1 } });
    const { GET } = await import("@/app/api/inventory/summary/route");
    const result = await (await GET()).json(); expect(result.summary.operations.manufacturing).toBe(0);
  });
  it("discounted GST posts to CGST/SGST and reclassifies to IGST without duplicating revenue", async () => {
    await setup(); const q = await quote(); const inv = await convertQuoteToInvoice({ tenantId, userId, quote: q });
    expect(inv.totalAmount).toBe(1062);
    let balances = await getGstLedger(tenantId, new Date("2099-01-01")); expect(balances.output).toEqual({ cgst: 81, sgst: 81, igst: 0 });
    await postSalesInvoiceJournal({ tenantId, createdBy: userId, invoice: inv, current: { taxableAmount: 900, totalTax: 162, tcsAmount: 0, tdsAmount: 0, cgst: 0, sgst: 0, igst: 162 } }); await inv.save();
    balances = await getGstLedger(tenantId, new Date("2099-01-01")); expect(balances.output).toEqual({ cgst: 0, sgst: 0, igst: 162 });
    await postSalesInvoiceJournal({ tenantId, createdBy: userId, invoice: inv, current: { taxableAmount: 0, totalTax: 0, tcsAmount: 0, tdsAmount: 0 } });
    balances = await getGstLedger(tenantId, new Date("2099-01-01")); expect(balances.output).toEqual({ cgst: 0, sgst: 0, igst: 0 });
  });
  it("Q2C uses customer state for interstate invoice", async () => {
    await setup(); customer.address_tab.state_name = "Karnataka"; await customer.save();
    const inv = await convertQuoteToInvoice({ tenantId, userId, quote: await quote() });
    expect(inv.placeOfSupply).toBe("Karnataka"); expect(inv.taxes.gstBreakup).toHaveLength(1); expect(inv.taxes.gstBreakup[0].label).toBe("IGST");
  });
  it("concurrent quote conversion produces one invoice and one journal", async () => {
    await setup(); const q = await quote();
    const copies = await Promise.all([SalesQuotation.findById(q._id), SalesQuotation.findById(q._id)]);
    const results = await Promise.allSettled(copies.map((quote) => convertQuoteToInvoice({ tenantId, userId, quote })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await SalesInvoice.countDocuments({ tenantId })).toBe(1); expect(await JournalEntry.countDocuments({ tenantId })).toBe(1);
  });
  it("conversion retries after quote link-save failure reuse both invoice and journal", async () => {
    await setup(); const q = await quote(); vi.spyOn(q, "save").mockRejectedValueOnce(new Error("injected link failure"));
    await expect(convertQuoteToInvoice({ tenantId, userId, quote: q })).rejects.toThrow("injected");
    const fresh = await SalesQuotation.findById(q._id); await convertQuoteToInvoice({ tenantId, userId, quote: fresh });
    expect(await SalesInvoice.countDocuments({ tenantId })).toBe(1); expect(await JournalEntry.countDocuments({ tenantId })).toBe(1);
  });
  it("concurrent Q2C order invoices without an existing quote cannot create duplicates", async () => {
    await setup(); const o = await SaleOrder.create({ tenantId, header: { name: "SO-QA", partnerId: customer._id }, orderLines: [{ name: "Watch", productQty: 1, priceUnit: 1000, taxRate: 18, priceSubtotal: 1000 }], totals: { amountUntaxed: 1000, amountTax: 180, amountTotal: 1180 } });
    const copies = await Promise.all([SaleOrder.findById(o._id), SaleOrder.findById(o._id)]);
    const results = await Promise.allSettled(copies.map((order) => createInvoiceForOrder({ tenantId, userId, order })));
    expect(results.some((r) => r.status === "fulfilled")).toBe(true); expect(await SalesInvoice.countDocuments({ tenantId })).toBe(1); expect(await SalesQuotation.countDocuments({ tenantId })).toBe(1);
  });
  it("invoice TDS cannot be deducted again by a direct payment API call", async () => {
    await setup(); const q = await quote(); q.taxes = { mode: "tds", rate: 10, amount: 90 }; await q.save();
    const inv = await convertQuoteToInvoice({ tenantId, userId, quote: q });
    const { POST } = await import("@/app/api/sales/payments/route");
    const bank = await Account.findOne({ tenantId, code: "1120" });
    const res = await POST(request("/api/sales/payments", { customerId: customer._id, amountReceived: 1200, depositToAccountId: bank!._id, status: "paid", taxDeducted: true, tdsAmount: 90, allocations: [{ invoiceId: inv._id, amount: inv.totalAmount }] }));
    expect(res.status).toBe(400); expect((await res.json()).message).toContain("already recorded");
  });
  it("posts eligible purchase GST separately and offsets 10000 against 12000 leaving 2000", async () => {
    await setup(); const bill = await Invoice.create({ tenantId, name: "BILL-QA", partnerId: customer._id, moveType: "in_invoice", invoiceDate: new Date("2026-08-10"), state: "approved", poMatchStatus: "matched", invoiceLines: [{ name: "Stock", quantity: 1, priceUnit: 100000, priceSubtotal: 100000 }], amountUntaxed: 100000, amountTax: 10000, amountTotal: 110000, gstInputEligible: true, supplierState: "Maharashtra", placeOfSupply: "Maharashtra" });
    const { PATCH } = await import("@/app/api/finance/bills/[id]/route");
    const response = await PATCH(request("/api/finance/bills/x", { state: "posted" }), { params: Promise.resolve({ id: String(bill._id) }) });
    expect(response.status).toBe(200);
    const inv = await SalesInvoice.create({ tenantId, number: "INV-GST", customerId: customer._id, invoiceDate: new Date("2026-08-20"), lineItems: [], taxableAmount: 100000, totalAmount: 112000 });
    await postSalesInvoiceJournal({ tenantId, createdBy: userId, invoice: inv, current: { taxableAmount: 100000, totalTax: 12000, cgst: 6000, sgst: 6000, igst: 0, tdsAmount: 0, tcsAmount: 0 } });
    const summary = await getGstLedger(tenantId, new Date("2026-08-31T23:59:59.999Z"));
    expect(summary.totalCreditUsed).toBe(10000); expect(summary.totalCashPayable).toBe(2000);
    await postGstSetoff(tenantId, userId, "2026-08", JSON.stringify(summary));
    const after = await getGstLedger(tenantId, new Date("2026-08-31T23:59:59.999Z"));
    expect(after.input.cgst + after.input.sgst).toBe(0); expect(after.totalCashPayable).toBe(2000);
    await expect(postGstSetoff(tenantId, userId, "2026-08", JSON.stringify(after))).rejects.toThrow("already");
  });
  it("rate seeding is concurrent-safe, expands the catalog, and preserves tenant edits", async () => {
    await setup(); await Promise.all([ensureDefaultTdsTcsRates(tenantId, userId), ensureDefaultTdsTcsRates(tenantId, userId)]);
    expect(await TaxRate.countDocuments({ tenantId, type: "tds" })).toBeGreaterThan(30);
    expect(await TaxRate.countDocuments({ tenantId, type: "tcs" })).toBe(10);
    const rate = await TaxRate.findOne({ tenantId, type: "tds" }); rate!.ratePercent = 7; rate!.status = "inactive"; await rate!.save();
    await ensureDefaultTdsTcsRates(tenantId, userId); expect((await TaxRate.findById(rate!._id))?.ratePercent).toBe(7);
  });
});
describe("GST arithmetic edge cases", () => {
  it("does not cross-apply CGST to SGST", () => {
    const result = calculateGstSetoff({ cgst: 10000, sgst: 0, igst: 0 }, { cgst: 0, sgst: 12000, igst: 0 });
    expect(result.totalCashPayable).toBe(12000); expect(result.remainingCredit.cgst).toBe(10000);
  });
  it("uses IGST before other credit and carries excess forward", () => {
    const result = calculateGstSetoff({ igst: 10000, cgst: 5000, sgst: 0 }, { igst: 2000, cgst: 4000, sgst: 6000 });
    expect(result.totalCashPayable).toBe(0); expect(result.remainingCredit.cgst).toBe(3000);
  });
  it("split rounding conserves every paisa and discounts reduce GST", () => {
    expect(splitGst(0.01, "Kerala", "Kerala")).toEqual({ cgst: 0.01, sgst: 0, igst: 0 });
    const t = computeInvoiceTotals({ lineItems: [line], extraDiscount: 100, sellerState: "Kerala", placeOfSupply: "Kerala" });
    expect(t.totalTax).toBe(144); expect(t.totalAmount).toBe(944);
  });
  it("purchase totals use product GST rather than a fixed 18%", () => {
    expect(computeBillTotals([{ quantity: 2, priceUnit: 100, taxRate: 5 }]).amountTotal).toBe(210);
    expect(() => computeBillTotals([{ quantity: 1, priceUnit: 100, taxRate: -18 }])).toThrow();
  });
});

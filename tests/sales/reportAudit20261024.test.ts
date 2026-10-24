import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ default: async () => {} }));
vi.mock("@/lib/aiRuntime/runtime/safeEmit", () => ({ safeEmitEvent: async () => {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { auth } from "@/auth";
import Customer from "@/models/sales/Customer";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import InventoryItem from "@/models/inventory/InventoryItem";
import DeliveryChallan from "@/models/sales/DeliveryChallan";
import { buildTemplateContext, ACTIVE_TEMPLATE_DEFINITIONS, renderInvoiceTemplate } from "@/lib/invoiceTemplates";
import { formatSalesCurrency, formatSalesDate } from "@/lib/sales/formatters";
import { GET as summaryGET } from "@/app/api/sales/summary/route";
import { GET as quotesGET, POST as quotesPOST } from "@/app/api/sales/quotes/route";
import { PATCH as quotePATCH } from "@/app/api/sales/quotes/[id]/route";
import { POST as customersPOST } from "@/app/api/sales/customers/route";
import { GET as modernOrdersGET } from "@/app/api/sales/sales-orders/route";
import { GET as legacyOrdersGET } from "@/app/api/sales/sale-orders/route";
import { PATCH as orderPATCH } from "@/app/api/sales/sales-orders/[id]/route";
import { POST as challanPOST } from "@/app/api/sales/delivery-challans/route";
import { GET as previewGET } from "@/app/api/sales/invoice-templates/[key]/preview/route";
import { POST as subscriptionPOST, GET as subscriptionGET } from "@/app/api/sales/subscriptions/route";
import { POST as pricelistPOST } from "@/app/api/sales/pricelists/route";
import { PATCH as pricelistPATCH, GET as pricelistGET } from "@/app/api/sales/pricelists/[id]/route";
import { GET as settingsGET, PATCH as settingsPATCH } from "@/app/api/sales/document-settings/route";
import { DELETE as invoiceDELETE } from "@/app/api/sales/invoices/[id]/route";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { PipelineCard } from "@/components/sales/pipeline/PipelineCard";
import Product from "@/models/inventory/Product";
import { GET as productsGET } from "@/app/api/sales/products/route";
import { GET as customersGET } from "@/app/api/sales/customers/route";
import { GET as invoicesGET } from "@/app/api/sales/invoices/route";
import { GET as quoteGET } from "@/app/api/sales/quotes/[id]/route";
import { POST as quoteOrderPOST } from "@/app/api/sales/quotes/[id]/convert-to-order/route";

const tenantId = `report-audit-${randomUUID().slice(0, 8)}`;
const userId = new mongoose.Types.ObjectId();
let customer: any;
const req = (path: string, body?: unknown) => new Request(`http://localhost/api/sales/${path}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) as any;
const params = (id: unknown) => ({ params: Promise.resolve({ id: String(id) }) });
const lines = [
  { name: "Chair", qty: 3, unitPrice: 7499, discount: 0, discountMode: "percent", taxRate: 0 },
  { name: "Fractional service", qty: 2.5, unitPrice: 1234.56, discount: 0, discountMode: "percent", taxRate: 0 },
];
const quoteBody = () => ({ customerId: String(customer._id), lineItems: lines, itemLevelDiscountPercent: 10, adjustment: 0.94 });

beforeAll(async () => {
  if (!process.env.QA_DISPOSABLE_MONGO_PORT) throw new Error("Run this audit with QA_DISPOSABLE_MONGO_PORT against a disposable database");
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all([Customer.init(), SalesQuotation.init(), SalesInvoice.init(), SaleOrder.init(), InventoryItem.init(), DeliveryChallan.init()]);
  customer = await Customer.create({ tenantId, header: { name: "Himalaya Audit", displayName: "Himalaya Audit" }, createdBy: userId });
});
beforeEach(() => vi.mocked(auth).mockResolvedValue({ user: { id: String(userId), tenantId, role: "admin" } } as any));
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

describe("Original 22 October Sales report — independent route and renderer audit", () => {
  it("SALES-BUG-001: dashboard uses invoice date, excludes draft/cancelled/future/other-tenant invoices", async () => {
    const now = Date.now();
    const fixture = (number: string, totalAmount: number, status: string, daysAgo: number, tenant = tenantId) => ({ tenantId: tenant, number, customerId: customer._id, invoiceDate: new Date(now - daysAgo * 86400000), status, taxableAmount: totalAmount, totalAmount, createdAt: new Date(now) });
    await SalesInvoice.collection.insertMany([
      fixture("AUDIT-SAVED", 29146, "saved", 2), fixture("AUDIT-PAID", 900, "paid", 3),
      fixture("AUDIT-DRAFT", 5000000, "draft", 1), fixture("AUDIT-CANCEL", 2000000, "cancelled", 1),
      fixture("AUDIT-OLD", 900000, "saved", 90), fixture("AUDIT-FUTURE", 800000, "saved", -5),
      fixture("AUDIT-OTHER", 700000, "saved", 1, "other-tenant"),
    ]);
    const response = await summaryGET();
    expect(response.status).toBe(200);
    expect((await response.json()).totalRevenue).toBe(30046);
    await SalesInvoice.deleteMany({ number: /^AUDIT-/ });
  });

  it("SALES-BUG-003/004: every active print template preserves 2.5 and separates 23025.06 taxable from 0.94 adjustment", async () => {
    const context = await buildTemplateContext({ invoice: { number: "INV-AUDIT-DECIMAL", customerId: customer, lineItems: lines, itemLevelDiscountPercent: 10, additionalCharges: [{ name: "Adjustment", amount: 0.94, isTaxable: false }], placeOfSupply: "Maharashtra" }, settingsDoc: { display: { showHsnSummary: true } }, company: { name: "QA", state: "Maharashtra" } });
    expect(context.totals.taxableAmount).toBeCloseTo(23025.06, 2);
    expect(context.totals.totalAmount).toBeCloseTo(23026, 2);
    expect(context.hsnSummary.reduce((sum: number, row: any) => sum + row.taxableValue, 0)).toBeCloseTo(23025.06, 2);
    for (const template of ACTIVE_TEMPLATE_DEFINITIONS) {
      const html = renderInvoiceTemplate(template, context);
      // The service layout deliberately hides quantity; verify all layouts that display it.
      if (!template.serviceStyle) expect(html, template.key).toMatch(/>\s*2\.5\s*</);
      expect(html, template.key).toContain("23,025.06");
      expect(html, template.key).toContain("Adjustment");
      expect(html, template.key).toContain("0.94");
    }
  });

  it.each([
    { itemLevelDiscountPercent: 150 },
    { extraDiscount: 150, extraDiscountMode: "percent" },
    { lineItems: [{ ...lines[0], discount: 150 }] },
  ])("SALES-BUG-005: actual create route rejects out-of-range discount %j", async (override) => {
    const before = await SalesQuotation.countDocuments({ tenantId });
    const response = await quotesPOST(req("quotes", { ...quoteBody(), ...override }));
    expect(response.status).toBe(400);
    expect(await SalesQuotation.countDocuments({ tenantId })).toBe(before);
  });

  it.each([0, -2])("SALES-BUG-006: actual create route rejects quantity %s", async (qty) => {
    expect((await quotesPOST(req("quotes", { ...quoteBody(), lineItems: [{ ...lines[0], qty }] }))).status).toBe(400);
  });

  it("SALES-BUG-007: attempting Save as Draft on an invoiced quote is rejected and status stays invoiced", async () => {
    const quote = await SalesQuotation.create({ ...quoteBody(), tenantId, quoteNumber: "AUDIT-LOCKED", status: "invoiced", createdBy: userId });
    const response = await quotePATCH(req("quotes/x", { ...quoteBody(), status: "draft" }), params(quote._id));
    expect(response.status).toBe(409);
    expect((await SalesQuotation.findById(quote._id))?.status).toBe("invoiced");
  });

  it("SALES-BUG-008: quote search resolves customer names and remains tenant scoped", async () => {
    await SalesQuotation.create({ ...quoteBody(), tenantId, quoteNumber: "AUDIT-SEARCH", createdBy: userId });
    const response = await quotesGET(req("quotes?search=Himalaya%20Audit"));
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.some((quote: any) => quote.quoteNumber === "AUDIT-SEARCH")).toBe(true);
    expect(data.every((quote: any) => quote.tenantId === tenantId)).toBe(true);
  });

  it.each([{ email: "not-an-email" }, { email: "qa@@test" }, { mobile: "12ab!" }])("SALES-BUG-009: customer create route rejects malformed contact %j", async (contact_details) => {
    const response = await customersPOST(req("customers", { header: { name: "QA Invalid Contact" }, contact_details }));
    expect(response.status).toBe(400);
    expect(await Customer.countDocuments({ tenantId, "header.name": "QA Invalid Contact" })).toBe(0);
  });

  it("SALES-BUG-010: both order endpoints include 70 imported drafts and a modern confirmed order", async () => {
    await SaleOrder.collection.insertMany(Array.from({ length: 70 }, (_, i) => ({ tenantId, header: { name: `SO-V3-AUDIT-${i}`, partnerId: customer._id }, status: "draft", q2cStatus: "sales_order_created", totals: { amountTotal: 100 } })));
    await SaleOrder.collection.insertOne({ tenantId, header: { name: "SO-AUDIT-MODERN", partnerId: customer._id }, salesOrderStatus: "confirmed", status: "draft" });
    const legacy = await (await legacyOrdersGET(req("sale-orders?page=1&limit=100"))).json();
    const modern = await (await modernOrdersGET(req("sales-orders?limit=100"))).json();
    expect(legacy.total).toBe(71);
    expect(modern.total).toBe(71);
    expect(legacy.items.map((o: any) => o.header.name).sort()).toEqual(modern.data.map((o: any) => o.header.name).sort());
  });

  it("SALES-BUG-010 follow-up: confirmed filter includes legacy approved orders in the modern list", async () => {
    await SaleOrder.collection.insertOne({ tenantId, header: { name: "SO-AUDIT-APPROVED", partnerId: customer._id }, status: "approved" });
    const response = await modernOrdersGET(req("sales-orders?status=confirmed&limit=100"));
    expect((await response.json()).data.some((o: any) => o.header.name === "SO-AUDIT-APPROVED")).toBe(true);
  });

  it("SALES-BUG-011/012: shared formatters return DD/MM/YYYY and Indian amount grouping", () => {
    expect(formatSalesDate("2026-10-22")).toBe("22/10/2026");
    expect(formatSalesCurrency(979995)).toContain("9,79,995.00");
  });

  it("SALES-BUG-011 follow-up: real pipeline card uses DD/MM/YYYY even under a US browser locale", () => {
    const original = Date.prototype.toLocaleDateString;
    const locale = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(function (this: Date, locales, options) {
      return original.call(this, locales || "en-US", options);
    });
    try {
      const html = renderToStaticMarkup(createElement(PipelineCard, {
        order: { _id: "qa-card", header: { name: "SO-QA-DATE" }, createdAt: "2026-10-22T12:00:00Z", totals: { amountTotal: 100 } },
        stage: "lead", selectedOrder: null, setSelectedOrder: () => {}, handleQ2CTransition: async () => {}, formatCurrency: formatSalesCurrency,
      }));
      expect(html).toContain("22/10/2026");
    } finally { locale.mockRestore(); }
  });

  it("SALES-BUG-014: real preview endpoint renders recalculated sample totals and a quantity column", async () => {
    const response = await previewGET(req("invoice-templates/modern/preview"), { params: Promise.resolve({ key: "modern" }) });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const totals = computeInvoiceTotals({ lineItems: [
      { name: "Consulting", qty: 2, unitPrice: 5000, discount: 5, discountMode: "percent", taxRate: 18 },
      { name: "Widget", qty: 10, unitPrice: 350, discount: 0, discountMode: "percent", taxRate: 12 },
      { name: "Support", qty: 1, unitPrice: 12000, discount: 500, discountMode: "amount", taxRate: 18 },
    ], extraDiscount: 100, extraDiscountMode: "amount", roundOff: true, additionalCharges: [{ name: "Adjustment / Delivery", amount: 150, isTaxable: false }], sellerState: "Maharashtra", placeOfSupply: "Maharashtra" });
    expect(data.html).toContain(totals.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(data.html).toContain(totals.taxableAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(data.html).toMatch(/>Qty</);
  });

  it("UNTESTED create subscription (also used by Subscription Quote) persists billing schedule and amount", async () => {
    const response = await subscriptionPOST(req("subscriptions", { customerId: String(customer._id), profileName: "QA Monthly", number: "SUB-AUDIT", lineItems: [{ name: "Service", qty: 2, unitPrice: 500, taxRate: 0 }], billingFrequency: "monthly", startDate: "2026-10-24" }));
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.totalAmount).toBe(1000);
    expect(data.nextBillingOn).toBeTruthy();
    const list = await (await subscriptionGET(req("subscriptions?search=QA%20Monthly"))).json();
    expect(list.data.some((item: any) => item.number === "SUB-AUDIT")).toBe(true);
  });

  it("UNTESTED create/edit pricelist persists a fixed-price rule", async () => {
    const created = await pricelistPOST(req("pricelists", { name: "QA Fixed Price", items: [{ applied_on: "3_global", compute_price: "fixed", fixed_price: 250 }] }));
    expect(created.status).toBe(201);
    const { item } = await created.json();
    const changed = await pricelistPATCH(req("pricelists/x", { name: "QA Edited Price", items: [{ applied_on: "3_global", compute_price: "fixed", fixed_price: 200 }] }), params(item._id));
    expect(changed.status).toBe(200);
    const loaded = await (await pricelistGET(req("pricelists/x"), params(item._id))).json();
    expect(loaded.item.name).toBe("QA Edited Price");
    expect(loaded.item.items[0].fixed_price).toBe(200);
  });

  it("UNTESTED Document Settings saves display options without allowing tenant override", async () => {
    expect((await settingsGET(req("document-settings"))).status).toBe(200);
    const updated = await settingsPATCH(req("document-settings", { tenantId: "wrong-tenant", display: { showQuantity3Decimals: true } }));
    expect(updated.status).toBe(200);
    const { data } = await (await settingsGET(req("document-settings"))).json();
    expect(data.tenantId).toBe(tenantId);
    expect(data.display.showQuantity3Decimals).toBe(true);
  });

  it("UNTESTED Put on Hold changes the actual order lifecycle status", async () => {
    const order = await SaleOrder.create({ tenantId, header: { name: "SO-AUDIT-HOLD", partnerId: customer._id }, salesOrderStatus: "confirmed", createdBy: userId });
    const response = await orderPATCH(req("sales-orders/x", { salesOrderStatus: "on_hold" }), params(order._id));
    expect(response.status).toBe(200);
    expect((await SaleOrder.findById(order._id))?.salesOrderStatus).toBe("on_hold");
  });

  it.each(["tds", "tcs"])("UNTESTED quote %s calculation uses the chosen percentage", async (mode) => {
    const response = await quotesPOST(req("quotes", { customerId: String(customer._id), lineItems: [{ name: "QA Tax Service", qty: 1, unitPrice: 1000, taxRate: 0 }], taxes: { mode, rate: 10 } }));
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.totalAmount).toBe(mode === "tds" ? 900 : 1100);
    expect(data.taxes.amount).toBe(100);
  });

  it("UNTESTED column sorting: actual sales-order endpoint honors ascending and descending order number", async () => {
    const asc = await (await modernOrdersGET(req("sales-orders?sortField=header.name&sortDir=asc&limit=100"))).json();
    const desc = await (await modernOrdersGET(req("sales-orders?sortField=header.name&sortDir=desc&limit=100"))).json();
    expect(asc.data.map((item: any) => item.header.name)).toEqual(desc.data.map((item: any) => item.header.name).reverse());
  });

  it("TC-068: actual delete endpoint must reject deleting a paid invoice", async () => {
    const invoice = await SalesInvoice.create({ tenantId, number: "AUDIT-PAID-DELETE", customerId: customer._id, invoiceDate: new Date(), status: "paid", taxableAmount: 1000, totalAmount: 1000, createdBy: userId });
    const response = await invoiceDELETE(req("invoices/x"), params(invoice._id));
    expect([400, 403, 409]).toContain(response.status);
    expect(await SalesInvoice.exists({ _id: invoice._id })).toBeTruthy();
  });

  it("TC-069: actual shipment endpoint moves stock once, including on a repeated request", async () => {
    const stock = await InventoryItem.create({ tenantId, itemCode: "AUDIT-SHIP", name: "QA Shipment Motor", category: "Electronics", unit: "pcs", warehouse: "Main", quantity: 50, reorderLevel: 5, reorderQuantity: 20, unitCost: 200, totalValue: 10000, status: "in-stock", createdBy: userId });
    const order = await SaleOrder.create({ tenantId, header: { name: "SO-AUDIT-SHIP", partnerId: customer._id }, orderLines: [{ name: "QA Shipment Motor", productQty: 10, priceUnit: 200, priceSubtotal: 2000 }], salesOrderStatus: "confirmed", shipmentStatus: "not_shipped", createdBy: userId });
    const response = await orderPATCH(req("sales-orders/x", { shipmentStatus: "shipped" }), params(order._id));
    expect(response.status).toBe(200);
    expect((await InventoryItem.findById(stock._id))?.quantity).toBe(40);
    await orderPATCH(req("sales-orders/x", { shipmentStatus: "shipped" }), params(order._id));
    expect((await InventoryItem.findById(stock._id))?.quantity).toBe(40);
  });

  it("UNTESTED delivery challan: valid create uses authenticated tenant and is readable by that tenant", async () => {
    const response = await challanPOST(req("delivery-challans", { dcNumber: "DC-AUDIT", customer: "Himalaya Audit", deliveryAddress: "QA address", items: [{ description: "QA Motor", quantity: 1, unit: "pcs", rate: 200, amount: 200 }], createdBy: String(userId) }));
    expect(response.status).toBe(201);
    const document = await DeliveryChallan.findOne({ dcNumber: "DC-AUDIT", tenantId }).lean();
    expect(document).not.toBeNull();
  });

  it("S3: actual product picker excludes payment/receipt artifacts while keeping a legitimate one-rupee product", async () => {
    await Product.collection.insertMany(["Payment against BILL-000359", "Receipt against INV-000213", "QA One Rupee Washer"].map(name => ({ tenantId, header: { name }, tab_general_information: { type: "consu", list_price: 1 }, createdBy: userId })));
    const response = await productsGET(req("products"));
    expect(response.status).toBe(200);
    const body = await response.json();
    const products = body.items || body.products || body.data;
    expect(products.some((p: any) => p.header.name === "QA One Rupee Washer")).toBe(true);
    expect(products.some((p: any) => /^(Payment|Receipt) against/.test(p.header.name))).toBe(false);
  });

  it("S5/S6: customer receivables include saved unpaid invoices and the invoice list marks a past-due saved invoice overdue", async () => {
    await SalesInvoice.create({ tenantId, number: "AUDIT-RECEIVABLE", customerId: customer._id, invoiceDate: new Date(), dueDate: new Date(Date.now() - 86400000), status: "saved", taxableAmount: 59192, totalAmount: 59192, payments: [], createdBy: userId });
    const customers = await (await customersGET(req("customers?search=Himalaya%20Audit"))).json();
    expect(customers.items.find((c: any) => String(c._id) === String(customer._id)).receivables).toBe(59192);
    const invoices = await (await invoicesGET(req("invoices?search=AUDIT-RECEIVABLE"))).json();
    expect(invoices.data.find((invoice: any) => invoice.number === "AUDIT-RECEIVABLE").status).toBe("overdue");
  });

  it("TC-007/008/009/011/013/014: actual quote list paginates, searches number/nonsense, and filters status and dates inclusively", async () => {
    await SalesQuotation.create([1, 2, 3].map(day => ({ ...quoteBody(), tenantId, quoteNumber: `AUDIT-FILTER-${day}`, quoteDate: new Date(`2026-09-${20 + day}T12:00:00Z`), status: day === 3 ? "sent" : "draft", createdBy: userId })));
    const first = await (await quotesGET(req("quotes?search=AUDIT-FILTER&page=1&limit=2"))).json();
    const next = await (await quotesGET(req("quotes?search=AUDIT-FILTER&page=2&limit=2"))).json();
    expect(first.total).toBe(3); expect(first.data).toHaveLength(2); expect(next.data).toHaveLength(1);
    expect(first.data.some((q: any) => q._id === next.data[0]._id)).toBe(false);
    expect((await (await quotesGET(req("quotes?search=AUDIT-FILTER-1"))).json()).total).toBe(1);
    expect((await (await quotesGET(req("quotes?search=QA-NONSENSE-NO-MATCH"))).json()).total).toBe(0);
    const dates = await (await quotesGET(req("quotes?search=AUDIT-FILTER&dateFrom=2026-09-21&dateTo=2026-09-22"))).json();
    expect(dates.total).toBe(2);
    const sent = await (await quotesGET(req("quotes?search=AUDIT-FILTER&status=sent"))).json();
    expect(sent.total).toBe(1); expect(sent.data[0].status).toBe("sent");
  });

  it("TC-044/047/048/049/050: quote arithmetic, reload persistence, special characters, long item names and large rates", async () => {
    const special = `QA <&> \"₹\" ${"x".repeat(226)}`;
    const response = await quotesPOST(req("quotes", { ...quoteBody(), subject: special }));
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data.taxableAmount).toBeCloseTo(23025.06, 2);
    expect(data.totalAmount).toBeCloseTo(23026, 2);
    const loaded = await (await quoteGET(req("quotes/x"), params(data._id))).json();
    expect(loaded.data.subject).toBe(special); expect(loaded.data.lineItems[1].qty).toBe(2.5); expect(loaded.data.adjustment).toBe(0.94);
    const large = await quotesPOST(req("quotes", { customerId: String(customer._id), lineItems: [{ name: special, qty: 1000000, unitPrice: 99999.999, discount: 0, discountMode: "percent", taxRate: 0 }] }));
    expect(large.status).toBe(201);
    const largeData = (await large.json()).data;
    expect(largeData.totalAmount).toBe(99999999000); expect(largeData.lineItems[0].name).toBe(special);
  });

  it("TC-051: concurrent Move to Sales Order requests create only one order", async () => {
    const quote = await SalesQuotation.create({ ...quoteBody(), tenantId, quoteNumber: "AUDIT-CONCURRENT-ORDER", status: "draft", createdBy: userId });
    const responses = await Promise.all([quoteOrderPOST(req("quotes/x/convert-to-order", {}), params(quote._id)), quoteOrderPOST(req("quotes/x/convert-to-order", {}), params(quote._id))]);
    expect(await SaleOrder.countDocuments({ tenantId, quoteId: quote._id })).toBe(1);
    expect(responses.filter(r => r.status === 201)).toHaveLength(1);
  });
});

/**
 * System-wide demo seed for `default-tenant` — fills every module's screens
 * with realistic, internally-consistent Indian-business demo data so the
 * whole app can be evaluated without empty states.
 *
 * Idempotent: every ensure* function checks-before-inserting (by a stable
 * business key — name/number/type) so re-running never duplicates rows or
 * touches pre-existing non-demo data. Nothing is ever deleted.
 *
 * Usage: npm run seed:demo
 * Requires MONGODB_URI in .env (same as the running app).
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";

import Customer from "../models/Customer";
import Vendor from "../models/Vendor";
import Product from "../models/Product";
import TaxRate from "../models/TaxRate";
import SalesQuotation from "../models/SalesQuotation";
import SaleOrder from "../models/SaleOrder";
import Payment from "../models/Payment";
import EInvoice from "../models/EInvoice";
import PurchaseOrder from "../models/PurchaseOrder";
import Invoice from "../models/Invoice";
import BillOfMaterial from "../models/BillOfMaterial";
import ManufacturingOrder from "../models/ManufacturingOrder";
import StockMove from "../models/StockMove";
import Warehouse from "../models/Warehouse";
import DunningRule from "../models/DunningRule";
import CustomField from "../models/CustomField";
import { SalesInvoice } from "../models/SalesInvoice";
import Subscription from "../models/Subscription";

import { computeInvoiceTotals } from "../lib/sales/invoiceMath";
import { generateQuoteNumber } from "../lib/sales/quoteNumbering";
import { generateSaleOrderNumber } from "../lib/sales/saleOrderNumbering";
import { generatePaymentNumber } from "../lib/sales/paymentNumbering";
import { applyAllocationsToInvoices } from "../lib/sales/paymentAllocation";
import { resolveInvoiceStatus } from "../lib/sales/invoiceStatus";
import {
  QUOTE_STATUS,
  SALES_ORDER_STATUS,
  SALES_ORDER_SHIPMENT_STATUS,
  SALES_ORDER_INVOICING_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  EINVOICE_STATUS,
  STOCK_MOVE_STATUS,
  DOCUMENT_STATUS,
  PRODUCTION_STATUS,
  SALES_SUBSCRIPTION_STATUS,
  SUBSCRIPTION_BILLING_FREQUENCY,
  CUSTOMER_TYPE,
} from "../lib/constants/statuses";

const TENANT_ID = "default-tenant";
const SEED_USER_ID = "6a1f1d9f90da1d224b7a84fc"; // David Davis (sales)
const ADMIN_USER_ID = "6a215dc202e80e4219f412c0"; // Aupulens Admin

const today = new Date();
const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000);
const daysFromNow = (n: number) => new Date(today.getTime() + n * 86400000);

async function ensureCustomers() {
  const defs = [
    { name: "Meridian Business Solutions" }, // already exists from invoice seed
    { name: "Coastal Retail Traders" }, // already exists from invoice seed
    {
      name: "Sundar Textiles Pvt Ltd",
      type: CUSTOMER_TYPE.BUSINESS,
      state: "Tamil Nadu",
      city: "Coimbatore",
      email: "accounts@sundartextiles.example",
      gstin: "33AABCS1234F1Z8",
      openingBalance: 15000,
      portalEnabled: true,
    },
    {
      name: "Rajesh Kumar",
      type: CUSTOMER_TYPE.INDIVIDUAL,
      state: "Maharashtra",
      city: "Nagpur",
      email: "rajesh.kumar@example.com",
      openingBalance: 0,
      portalEnabled: false,
    },
    {
      name: "Greenfield Agro Exports",
      type: CUSTOMER_TYPE.BUSINESS,
      state: "Punjab",
      city: "Ludhiana",
      email: "finance@greenfieldagro.example",
      gstin: "03AAECG5678K1ZQ",
      openingBalance: 42000,
      portalEnabled: false,
    },
    {
      name: "Om Sai Traders",
      type: CUSTOMER_TYPE.INDIVIDUAL,
      state: "Gujarat",
      city: "Surat",
      email: "omsaitraders@example.com",
      openingBalance: 0,
      portalEnabled: true,
    },
    {
      name: "Kaveri Subscriptions Pvt Ltd",
      type: CUSTOMER_TYPE.BUSINESS,
      state: "Karnataka",
      city: "Mysuru",
      email: "billing@kaverisub.example",
      gstin: "29AACCK4321L1ZR",
      openingBalance: 0,
      portalEnabled: true,
      subscriber: true,
    },
    {
      name: "Himalaya Fitness Studio",
      type: CUSTOMER_TYPE.BUSINESS,
      state: "Delhi",
      city: "New Delhi",
      email: "admin@himalayafitness.example",
      openingBalance: 0,
      portalEnabled: false,
      subscriber: true,
    },
  ];

  const created: any[] = [];
  for (const d of defs) {
    let doc = await Customer.findOne({ tenantId: TENANT_ID, "header.name": d.name });
    if (doc) {
      created.push(doc);
      continue;
    }
    if (!("type" in d)) continue; // the two "already exists" placeholders — skip if truly missing
    doc = await Customer.create({
      tenantId: TENANT_ID,
      createdBy: SEED_USER_ID,
      header: { name: d.name, is_company: d.type === CUSTOMER_TYPE.BUSINESS, customerType: d.type },
      contact_details: { email: d.email, phone: "+919800000" + Math.floor(Math.random() * 900 + 100) },
      address_tab: { type: "contact", city: (d as any).city, state_name: (d as any).state },
      shipping_address: { street: "Gate 1", city: (d as any).city, state_name: (d as any).state },
      gstin: (d as any).gstin,
      currency: "INR",
      openingBalance: (d as any).openingBalance || 0,
      portalEnabled: !!(d as any).portalEnabled,
      addresses: [
        { type: "billing", isPrimary: true, city: (d as any).city, state_name: (d as any).state, country: "India" },
        { type: "shipping", isPrimary: true, city: (d as any).city, state_name: (d as any).state, country: "India" },
      ],
      contactPersons: [{ firstName: d.name.split(" ")[0], lastName: "Contact", email: (d as any).email, designation: "Accounts" }],
    } as any);
    console.log("Created customer:", d.name);
    created.push(doc);
  }
  return { all: await Customer.find({ tenantId: TENANT_ID }).lean(), specDefs: defs, created };
}

async function ensureVendors() {
  const defs = [
    { name: "Bharat Steel Suppliers", category: "Raw Materials", email: "sales@bharatsteel.example" },
    { name: "Skyline Packaging Co", category: "Packaging", email: "orders@skylinepack.example" },
    { name: "Vedanta Electronics Distributors", category: "Electronics", email: "b2b@vedantaelec.example" },
    { name: "Nationwide Freight Carriers", category: "Logistics", email: "ops@nationwidefreight.example" },
    { name: "Prime Office Supplies", category: "Office Supplies", email: "sales@primeoffice.example" },
  ];
  for (const d of defs) {
    const existing = await Vendor.findOne({ tenantId: TENANT_ID, name: d.name });
    if (existing) continue;
    await Vendor.create({
      tenantId: TENANT_ID,
      name: d.name,
      category: d.category,
      contactEmail: d.email,
      phone: "+919900000" + Math.floor(Math.random() * 900 + 100),
      performanceMetrics: { deliveryTime: 5, qualityScore: 8, costRating: 7 },
    } as any);
    console.log("Created vendor:", d.name);
  }
  return Vendor.find({ tenantId: TENANT_ID }).lean();
}

async function ensureProducts() {
  const defs = [
    { name: "Industrial Packaging Roll", code: "PRD-PKG", type: "consu", price: 450, cost: 300 },
    { name: "GST Compliance Advisory (Monthly)", code: "PRD-GSTADV", type: "service", price: 3500, cost: 1500 },
    { name: "Solar Inverter 5kW", code: "PRD-SOLAR5", type: "consu", price: 42000, cost: 32000 },
    { name: "Office Ergonomic Chair", code: "PRD-CHAIR", type: "consu", price: 6500, cost: 4200 },
    { name: "Annual AMC - Basic", code: "PRD-AMCBASIC", type: "service", price: 12000, cost: 4000 },
    { name: "Annual AMC - Premium", code: "PRD-AMCPREM", type: "service", price: 24000, cost: 9000 },
    { name: "Industrial Bearing Set", code: "PRD-BEARING", type: "consu", price: 1800, cost: 1100 },
    { name: "Custom ERP Onboarding", code: "PRD-ONBOARD", type: "service", price: 15000, cost: 6000 },
    { name: "Warehouse Rack Unit (Steel)", code: "PRD-RACK", type: "consu", price: 9800, cost: 7200 },
  ];
  for (const d of defs) {
    const existing = await Product.findOne({ tenantId: TENANT_ID, "tab_general_information.default_code": d.code });
    if (existing) continue;
    await Product.create({
      tenantId: TENANT_ID,
      createdBy: SEED_USER_ID,
      header: { name: d.name, sale_ok: true, purchase_ok: true, can_be_expensed: false },
      tab_general_information: {
        type: d.type,
        invoice_policy: "order",
        service_upsell: false,
        list_price: d.price,
        taxes_id: [],
        standard_price: d.cost,
        default_code: d.code,
        description: d.name,
      },
      status: DOCUMENT_STATUS.APPROVED,
    } as any);
    console.log("Created product:", d.name);
  }
  return Product.find({ tenantId: TENANT_ID }).lean();
}

async function ensureTaxRates() {
  const defs = [
    { name: "GST 5%", rate: 5 },
    { name: "GST 12%", rate: 12 },
    { name: "GST 18%", rate: 18 },
  ];
  for (const d of defs) {
    const existing = await TaxRate.findOne({ tenantId: TENANT_ID, name: d.name });
    if (existing) continue;
    await TaxRate.create({
      tenantId: TENANT_ID,
      name: d.name,
      type: "gst",
      ratePercent: d.rate,
      appliesTo: "both",
      status: "active",
      createdBy: ADMIN_USER_ID,
    } as any);
    console.log("Created tax rate:", d.name);
  }
}

async function ensureQuotes(customers: any[], products: any[]) {
  const existingCount = await SalesQuotation.countDocuments({ tenantId: TENANT_ID });
  if (existingCount >= 6) {
    console.log(`Quotes: already ${existingCount} present, skipping.`);
    return;
  }
  const byName = (n: string) => customers.find((c) => c.header?.name === n);
  const p = (code: string) => products.find((x: any) => x.tab_general_information?.default_code === code);

  interface QuoteSpec {
    customer: any;
    status: string;
    lineItems: any[];
    quoteDate: Date;
    validTill: Date;
    tds?: number;
  }

  const specs: QuoteSpec[] = [
    {
      customer: byName("Sundar Textiles Pvt Ltd"),
      status: QUOTE_STATUS.SENT,
      lineItems: [{ name: "Industrial Packaging Roll", itemId: p("PRD-PKG")?._id, qty: 20, unitPrice: 450, discount: 0, discountMode: "percent", taxRate: 18 }],
      quoteDate: daysAgo(10),
      validTill: daysFromNow(20),
    },
    {
      customer: byName("Rajesh Kumar"),
      status: QUOTE_STATUS.ACCEPTED,
      lineItems: [{ name: "Office Ergonomic Chair", itemId: p("PRD-CHAIR")?._id, qty: 4, unitPrice: 6500, discount: 5, discountMode: "percent", taxRate: 18 }],
      quoteDate: daysAgo(25),
      validTill: daysAgo(5),
    },
    {
      customer: byName("Greenfield Agro Exports"),
      status: QUOTE_STATUS.REJECTED,
      lineItems: [{ name: "Solar Inverter 5kW", itemId: p("PRD-SOLAR5")?._id, qty: 2, unitPrice: 42000, discount: 0, discountMode: "percent", taxRate: 18 }],
      quoteDate: daysAgo(40),
      validTill: daysAgo(20),
    },
    {
      customer: byName("Om Sai Traders"),
      status: QUOTE_STATUS.INVOICED,
      lineItems: [{ name: "Warehouse Rack Unit (Steel)", itemId: p("PRD-RACK")?._id, qty: 3, unitPrice: 9800, discount: 0, discountMode: "percent", taxRate: 18 }],
      quoteDate: daysAgo(35),
      validTill: daysAgo(15),
      tds: 2,
    },
    {
      customer: byName("Meridian Business Solutions"),
      status: QUOTE_STATUS.SENT,
      lineItems: [
        { name: "Custom ERP Onboarding", itemId: p("PRD-ONBOARD")?._id, qty: 1, unitPrice: 15000, discount: 10, discountMode: "percent", taxRate: 18 },
        { name: "Annual AMC - Basic", itemId: p("PRD-AMCBASIC")?._id, qty: 1, unitPrice: 12000, discount: 0, discountMode: "percent", taxRate: 18 },
      ],
      quoteDate: daysAgo(3),
      validTill: daysFromNow(27),
    },
  ];

  for (const spec of specs) {
    if (!spec.customer) continue;
    const totals = computeInvoiceTotals({
      lineItems: spec.lineItems,
      itemLevelDiscountPercent: 0,
      additionalCharges: [],
      extraDiscount: 0,
      extraDiscountMode: "amount",
      roundOff: false,
      sellerState: "Maharashtra",
      placeOfSupply: spec.customer.address_tab?.state_name || "Maharashtra",
      tdsRate: spec.tds || 0,
      tcsRate: 0,
    });
    const { number } = await generateQuoteNumber(TENANT_ID);
    await SalesQuotation.create({
      tenantId: TENANT_ID,
      quoteNumber: number,
      customerId: spec.customer._id,
      quoteDate: spec.quoteDate,
      validTill: spec.validTill,
      salesperson: "David Davis",
      lineItems: spec.lineItems.map((li: any, i: number) => ({ ...li, lineTotal: totals.computedLines[i].lineTotal })),
      taxableAmount: totals.taxableAmount,
      totalDiscount: totals.totalDiscount,
      totalAmount: totals.totalAmount,
      taxes: { mode: spec.tds ? "tds" : "none", tds: spec.tds || 0, tcs: 0 },
      status: spec.status,
      createdBy: SEED_USER_ID,
    } as any);
    console.log("Created quote for", spec.customer.header.name, "-", spec.status);
  }
}

async function ensureSaleOrders(customers: any[], products: any[]) {
  const existingCount = await SaleOrder.countDocuments({ tenantId: TENANT_ID, salesOrderStatus: { $exists: true } });
  if (existingCount >= 5) {
    console.log(`Sale Orders: already ${existingCount} present, skipping.`);
    return;
  }
  const byName = (n: string) => customers.find((c) => c.header?.name === n);
  const p = (code: string) => products.find((x: any) => x.tab_general_information?.default_code === code);

  const specs = [
    {
      customer: byName("Sundar Textiles Pvt Ltd"),
      salesOrderStatus: SALES_ORDER_STATUS.DRAFT,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      invoicingStatus: SALES_ORDER_INVOICING_STATUS.NOT_INVOICED,
      lines: [{ name: "Industrial Packaging Roll", productId: p("PRD-PKG")?._id, priceUnit: 450, priceSubtotal: 4500, productQty: 10 }],
    },
    {
      customer: byName("Greenfield Agro Exports"),
      salesOrderStatus: SALES_ORDER_STATUS.PENDING_APPROVAL,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      invoicingStatus: SALES_ORDER_INVOICING_STATUS.NOT_INVOICED,
      lines: [{ name: "Solar Inverter 5kW", productId: p("PRD-SOLAR5")?._id, priceUnit: 42000, priceSubtotal: 84000, productQty: 2 }],
    },
    {
      customer: byName("Om Sai Traders"),
      salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.PARTIALLY_SHIPPED,
      invoicingStatus: SALES_ORDER_INVOICING_STATUS.PARTIALLY_INVOICED,
      lines: [{ name: "Warehouse Rack Unit (Steel)", productId: p("PRD-RACK")?._id, priceUnit: 9800, priceSubtotal: 29400, productQty: 3 }],
    },
    {
      customer: byName("Meridian Business Solutions"),
      salesOrderStatus: SALES_ORDER_STATUS.CLOSED,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.FULFILLED,
      invoicingStatus: SALES_ORDER_INVOICING_STATUS.INVOICED,
      lines: [{ name: "Custom ERP Onboarding", productId: p("PRD-ONBOARD")?._id, priceUnit: 15000, priceSubtotal: 15000, productQty: 1 }],
    },
    {
      customer: byName("Rajesh Kumar"),
      salesOrderStatus: SALES_ORDER_STATUS.VOID,
      shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
      invoicingStatus: SALES_ORDER_INVOICING_STATUS.NOT_INVOICED,
      lines: [{ name: "Office Ergonomic Chair", productId: p("PRD-CHAIR")?._id, priceUnit: 6500, priceSubtotal: 6500, productQty: 1 }],
    },
  ];

  for (const spec of specs) {
    if (!spec.customer) continue;
    const { number } = await generateSaleOrderNumber(TENANT_ID);
    const amountUntaxed = spec.lines.reduce((sum, l) => sum + l.priceSubtotal, 0);
    const amountTax = Math.round(amountUntaxed * 0.18);
    await SaleOrder.create({
      tenantId: TENANT_ID,
      header: { name: number, partnerId: spec.customer._id, dateOrder: daysAgo(Math.floor(Math.random() * 20 + 1)) },
      orderLines: spec.lines,
      totals: { amountUntaxed, amountTax, amountTotal: amountUntaxed + amountTax },
      salesOrderStatus: spec.salesOrderStatus,
      shipmentStatus: spec.shipmentStatus,
      invoicingStatus: spec.invoicingStatus,
      otherInfo: { salespersonId: SEED_USER_ID },
      createdBy: SEED_USER_ID,
    } as any);
    console.log("Created sale order", number, "-", spec.salesOrderStatus);
  }
}

async function ensurePayments(customers: any[]) {
  const existingCount = await Payment.countDocuments({ tenantId: TENANT_ID });
  if (existingCount >= 6) {
    console.log(`Payments: already ${existingCount} present, skipping.`);
    return;
  }
  // Find real unpaid/partially-paid invoices to allocate against, so statuses stay consistent.
  const invoices = await (SalesInvoice as any).find({ tenantId: TENANT_ID, status: { $in: ["saved", "partially_paid", "overdue"] } })
    .sort({ totalAmount: -1 })
    .limit(6)
    .lean();

  if (invoices.length === 0) {
    console.log("Payments: no unpaid invoices found to allocate against, skipping.");
    return;
  }

  const specs = [
    { type: "partial", invoice: invoices[0], amount: Math.round((invoices[0] as any).totalAmount * 0.4) },
    { type: "retainer", invoice: null, amount: 5000 },
    { type: "draft", invoice: invoices[1], amount: (invoices[1] as any)?.totalAmount },
  ].filter((s) => s.type === "retainer" || s.invoice);

  for (const spec of specs) {
    const customerId = spec.invoice ? (spec.invoice as any).customerId : customers[0]._id;
    const { number } = await generatePaymentNumber(TENANT_ID);
    const isRetainer = spec.type === "retainer";
    const isDraft = spec.type === "draft";
    const allocations = spec.invoice && !isDraft ? [{ invoiceId: (spec.invoice as any)._id, amount: spec.amount }] : [];

    const payment = await Payment.create({
      tenantId: TENANT_ID,
      customerId,
      paymentNumber: number,
      paymentDate: daysAgo(Math.floor(Math.random() * 10 + 1)),
      amountReceived: spec.amount,
      mode: isRetainer ? "Bank" : "UPI",
      paymentType: isRetainer ? PAYMENT_TYPE.RETAINER : PAYMENT_TYPE.INVOICE_PAYMENT,
      status: isDraft ? PAYMENT_STATUS.DRAFT : PAYMENT_STATUS.PAID,
      allocations,
      unusedAmount: isRetainer ? spec.amount : 0,
      createdBy: SEED_USER_ID,
    } as any);

    if (allocations.length > 0 && !isDraft) {
      await applyAllocationsToInvoices({
        tenantId: TENANT_ID,
        paymentId: String(payment._id),
        paymentNumber: number,
        paymentDate: payment.paymentDate,
        mode: payment.mode,
        allocations: allocations as any,
      });
    }
    console.log("Created payment", number, "-", spec.type);
  }
}

async function ensureEInvoices() {
  const existingCount = await EInvoice.countDocuments({ tenantId: TENANT_ID });
  if (existingCount >= 4) {
    console.log(`E-Invoices: already ${existingCount} present, skipping.`);
    return;
  }
  const invoices = await (SalesInvoice as any).find({ tenantId: TENANT_ID }).limit(6).lean();
  const statuses = [EINVOICE_STATUS.SUCCESS, EINVOICE_STATUS.PENDING, EINVOICE_STATUS.FAILED, EINVOICE_STATUS.CANCELLED];

  for (let i = 0; i < Math.min(statuses.length, invoices.length); i++) {
    const inv = invoices[i] as any;
    const existing = await EInvoice.findOne({ tenantId: TENANT_ID, invoiceId: inv._id });
    if (existing) continue;
    const status = statuses[i];
    await EInvoice.create({
      tenantId: TENANT_ID,
      invoiceId: inv._id,
      amount: inv.totalAmount,
      status,
      irn: status === EINVOICE_STATUS.SUCCESS ? "IRN" + Math.random().toString(36).slice(2, 18).toUpperCase() : undefined,
      ackNo: status === EINVOICE_STATUS.SUCCESS ? String(Math.floor(Math.random() * 1e11)) : undefined,
      ackDate: status === EINVOICE_STATUS.SUCCESS ? daysAgo(2) : undefined,
      errorMessage: status === EINVOICE_STATUS.FAILED ? "NIC portal validation failed: invalid HSN code on line 2." : undefined,
      createdBy: SEED_USER_ID,
    } as any);
    console.log("Created e-invoice for", inv.number, "-", status);
  }
}

async function ensurePurchasesAndBills(customers: any[], products: any[]) {
  const poCount = await PurchaseOrder.countDocuments({ tenantId: TENANT_ID });
  const p = (code: string) => products.find((x: any) => x.tab_general_information?.default_code === code);
  if (poCount < 4) {
    const specs = [
      { name: "PO-DEMO-0003", status: DOCUMENT_STATUS.APPROVED, product: p("PRD-BEARING"), qty: 50, price: 1100 },
      { name: "PO-DEMO-0004", status: DOCUMENT_STATUS.POSTED, product: p("PRD-PKG"), qty: 100, price: 300 },
    ];
    for (const spec of specs) {
      if (!spec.product) continue;
      const existing = await PurchaseOrder.findOne({ tenantId: TENANT_ID, name: spec.name });
      if (existing) continue;
      await PurchaseOrder.create({
        tenantId: TENANT_ID,
        name: spec.name,
        partnerId: customers[0]._id,
        createdBy: SEED_USER_ID,
        status: spec.status,
        orderLines: [
          {
            productId: spec.product._id,
            name: spec.product.header.name,
            productQty: spec.qty,
            priceUnit: spec.price,
            priceSubtotal: spec.qty * spec.price,
          },
        ],
      } as any);
      console.log("Created purchase order", spec.name);
    }
  } else {
    console.log(`Purchase Orders: already ${poCount} present, skipping.`);
  }

  // Vendor bills are Invoice documents with moveType: "in_invoice" — the real
  // Vendor Bills screen (app/finance/bills/page.tsx) has always read from
  // here, not from models/Bill.ts (a disconnected, orphaned schema; see
  // QA_GAP_REPORT.md item #15 and scripts/migrate-bill-split-brain.ts).
  const billCount = await Invoice.countDocuments({ tenantId: TENANT_ID, moveType: "in_invoice" });
  if (billCount < 3) {
    const specs = [
      { number: `DEMO-BILL-${TENANT_ID}-1`, status: DOCUMENT_STATUS.APPROVED, amount: 55000 },
      { number: `DEMO-BILL-${TENANT_ID}-2`, status: DOCUMENT_STATUS.DRAFT, amount: 30000 },
    ];
    for (const spec of specs) {
      const existing = await Invoice.findOne({ tenantId: TENANT_ID, name: spec.number });
      if (existing) continue;
      await Invoice.create({
        tenantId: TENANT_ID,
        name: spec.number,
        partnerId: customers[0]._id,
        moveType: "in_invoice",
        invoiceDate: daysAgo(10),
        dueDate: daysFromNow(20),
        state: spec.status,
        invoiceLines: [{ name: "Goods received", quantity: 1, priceUnit: spec.amount, priceSubtotal: spec.amount }],
        currencyId: "INR",
        amountUntaxed: spec.amount,
        amountTax: 0,
        amountTotal: spec.amount,
        amountResidual: spec.amount,
        paymentState: "not_paid",
        createdBy: SEED_USER_ID,
      } as any);
      console.log("Created bill", spec.number);
    }
  } else {
    console.log(`Bills: already ${billCount} present, skipping.`);
  }
}

async function ensureManufacturing(products: any[]) {
  const bomCount = await BillOfMaterial.countDocuments({ tenantId: TENANT_ID });
  const p = (code: string) => products.find((x: any) => x.tab_general_information?.default_code === code);
  if (bomCount < 2) {
    const finished = p("PRD-SOLAR5");
    const component = p("PRD-BEARING");
    if (finished && component) {
      const existing = await BillOfMaterial.findOne({ tenantId: TENANT_ID, "header.productId": finished._id });
      if (!existing) {
        await BillOfMaterial.create({
          tenantId: TENANT_ID,
          header: { productId: finished._id, bomType: "mrp" },
          components_tab: [{ productId: component._id, quantity: 4 }],
          active: true,
        } as any);
        console.log("Created BOM for", finished.header.name);
      }
    }
  } else {
    console.log(`BOMs: already ${bomCount} present, skipping.`);
  }

  const moCount = await ManufacturingOrder.countDocuments({ tenantId: TENANT_ID });
  if (moCount < 3) {
    const finished = p("PRD-SOLAR5");
    if (finished) {
      const specs = [
        { name: "MO-DEMO-0003", productionStatus: PRODUCTION_STATUS.IN_PRODUCTION, qty: 5 },
        { name: "MO-DEMO-0004", productionStatus: PRODUCTION_STATUS.QC_PASSED, qty: 8 },
      ];
      for (const spec of specs) {
        const existing = await ManufacturingOrder.findOne({ tenantId: TENANT_ID, "header.name": spec.name });
        if (existing) continue;
        await ManufacturingOrder.create({
          tenantId: TENANT_ID,
          header: { name: spec.name, productId: finished._id, quantity: spec.qty },
          productionStatus: spec.productionStatus,
          createdBy: SEED_USER_ID,
        } as any);
        console.log("Created manufacturing order", spec.name);
      }
    }
  } else {
    console.log(`Manufacturing Orders: already ${moCount} present, skipping.`);
  }
}

async function ensureInventoryAdjustment(products: any[]) {
  const warehouse = await Warehouse.findOne({ tenantId: TENANT_ID });
  if (!warehouse) {
    console.log("Inventory: no warehouse found, skipping stock adjustment.");
    return;
  }
  const product = products.find((x: any) => x.tab_general_information?.default_code === "PRD-BEARING");
  if (!product) return;

  const reference = "ADJ-DEMO-0001";
  const existing = await StockMove.findOne({ tenantId: TENANT_ID, reference });
  if (existing) {
    console.log("Inventory adjustment already seeded, skipping.");
    return;
  }
  await StockMove.create({
    tenantId: TENANT_ID,
    reference,
    moveType: "adjustment",
    moveStatus: STOCK_MOVE_STATUS.ACCOUNTING_CREATED,
    lines: [{ productId: product._id, productName: product.header.name, demand: 25 }],
    destinationLocation: { warehouseId: warehouse._id },
    valuation: { method: "standard" },
  } as any);
  console.log("Created inventory adjustment", reference);
}

async function ensureSubscriptionForNewCustomers(customers: any[]) {
  const byName = (n: string) => customers.find((c) => c.header?.name === n);
  const targets = [
    { name: "Kaveri Subscriptions Pvt Ltd", number: "SUB-DEMO-0001", status: SALES_SUBSCRIPTION_STATUS.ACTIVE },
    { name: "Himalaya Fitness Studio", number: "SUB-DEMO-0002", status: SALES_SUBSCRIPTION_STATUS.TRIAL },
  ];
  for (const t of targets) {
    const cust = byName(t.name);
    if (!cust) continue;
    const existing = await Subscription.findOne({ tenantId: TENANT_ID, number: t.number });
    if (existing) continue;
    await Subscription.create({
      tenantId: TENANT_ID,
      number: t.number,
      profileName: `${t.name} - Monthly AMC`,
      customerId: cust._id,
      status: t.status,
      billingFrequency: SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY,
      nextBillingOn: daysFromNow(15),
      activatedOn: daysAgo(30),
      trialDays: t.status === SALES_SUBSCRIPTION_STATUS.TRIAL ? 14 : 0,
      trialEndsAt: t.status === SALES_SUBSCRIPTION_STATUS.TRIAL ? daysFromNow(5) : undefined,
      autoRenew: true,
      lineItems: [{ name: "Annual AMC - Basic", qty: 1, unitPrice: 12000, taxRate: 18, lineTotal: 12000 }],
      totalAmount: 12000,
      createdBy: SEED_USER_ID,
    } as any);
    console.log("Created subscription", t.number, "for", t.name);
  }
}

async function ensureDunningRule() {
  const existing = await DunningRule.findOne({ tenantId: TENANT_ID, name: "Gentle Reminder Ladder" });
  if (existing) {
    console.log("Non-default dunning rule already present, skipping.");
    return;
  }
  await DunningRule.create({
    tenantId: TENANT_ID,
    name: "Gentle Reminder Ladder",
    status: "active",
    isDefault: false,
    paymentMethod: "cards",
    autocharge: { retries: [{ afterDays: 5, action: "retry" }, { afterDays: 10, action: "retry" }] },
    manual: { retries: [{ afterDays: 7, action: "email" }] },
  } as any);
  console.log("Created non-default dunning rule: Gentle Reminder Ladder");
}

async function ensurePaymentCustomField() {
  const existing = await CustomField.findOne({ tenantId: TENANT_ID, appliesTo: "payment", label: "Reference PO Number" });
  if (existing) {
    console.log("Payment custom field already present, skipping.");
    return;
  }
  await CustomField.create({
    tenantId: TENANT_ID,
    appliesTo: "payment",
    label: "Reference PO Number",
    fieldType: "text",
    status: "active",
    createdBy: ADMIN_USER_ID,
  } as any);
  console.log("Created payment custom field: Reference PO Number");
}

async function main() {
  await connectDB();
  console.log("Connected. Seeding demo data for tenant:", TENANT_ID, "\n");

  const { all: customers } = await ensureCustomers();
  const vendors = await ensureVendors();
  const products = await ensureProducts();
  await ensureTaxRates();
  await ensureQuotes(customers, products);
  await ensureSaleOrders(customers, products);
  await ensurePayments(customers);
  await ensureEInvoices();
  await ensurePurchasesAndBills(customers, products);
  await ensureManufacturing(products);
  await ensureInventoryAdjustment(products);
  await ensureSubscriptionForNewCustomers(customers);
  await ensureDunningRule();
  await ensurePaymentCustomField();

  console.log("\nDemo seed complete.");
  console.log(`Customers: ${customers.length}, Vendors: ${vendors.length}, Products: ${products.length}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

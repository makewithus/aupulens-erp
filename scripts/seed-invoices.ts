/**
 * Reseeds the Sales Invoice demo data for the `default-tenant` tenant so all
 * 9 active template categories can be verified end to end without a live
 * browser session — one invoice per template, varied data (CGST/SGST vs
 * IGST, discounts, TDS/TCS, split payments, draft/paid/overdue, service vs
 * goods, multi-HSN, attachments).
 *
 * Usage: npx tsx scripts/seed-invoices.ts
 * Requires MONGODB_URI in .env (same as the running app).
 *
 * See docs/INVOICE_SEED_README.md for what each invoice exercises and how to
 * verify it (and how to create one manually via the UI).
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import { SalesInvoice } from "../models/SalesInvoice";
import Organization from "../models/Organization";
import Customer from "../models/Customer";
import Product from "../models/Product";
import BankAccount from "../models/BankAccount";
import Account from "../models/Account";
import AccountType from "../models/AccountType";
import { DocumentSettings } from "../models/DocumentSettings";
import DocumentPrefix from "../models/DocumentPrefix";
import Counter from "../models/Counter";
import Coupon from "../models/Coupon";
import { computeInvoiceTotals } from "../lib/sales/invoiceMath";
import { generateInvoiceNumber } from "../lib/sales/invoiceNumbering";
import { resolveInvoiceStatus } from "../lib/sales/invoiceStatus";
import { ensureDefaultPrefixes } from "../lib/sales/documentPrefixes";
import { ensureInvoiceTemplatesSeeded } from "../lib/invoiceTemplates";
import { SALES_INVOICE_STATUS } from "../lib/constants/statuses";

const TENANT_ID = "default-tenant";
// David Davis (sales role) — an existing default-tenant user, used as createdBy for seeded records.
const SEED_USER_ID = "6a1f1d9f90da1d224b7a84fc";

// Tiny 1x1 transparent PNG — a stand-in for a real uploaded attachment/signature.
const SAMPLE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function ensureSellerProfile() {
  const org = await Organization.findOne({ subdomain: TENANT_ID });
  if (!org) throw new Error(`Organization with subdomain "${TENANT_ID}" not found — seed aborted.`);

  org.set("settings.state", "Maharashtra");
  org.set("settings.gstin", "27AAAAA0000A1Z5");
  org.set("settings.addressLine1", "402, Trade Tower, Bandra Kurla Complex");
  org.set("settings.addressLine2", "Bandra East");
  org.set("settings.city", "Mumbai");
  org.set("settings.pincode", "400051");
  await org.save();
  console.log("Seller profile set: Maharashtra, GSTIN 27AAAAA0000A1Z5");
}

async function ensureInvoicePrefixHasDash() {
  // A prior manual test created the default-tenant "invoice" prefix as "INV"
  // (missing the trailing dash the rest of the system assumes). Normalize it
  // so seeded/created invoice numbers read "INV-0001" rather than "INV0001".
  const row = await DocumentPrefix.findOne({ tenantId: TENANT_ID, documentType: "invoice", kind: "prefix", isDefault: true });
  if (row && row.value !== "INV-") {
    row.value = "INV-";
    await row.save();
    console.log('Normalized default invoice prefix to "INV-"');
  }
}

async function resetInvoiceCounter() {
  await Counter.deleteMany({ tenantId: TENANT_ID, key: { $regex: "^invoice:" } });
  console.log("Reset invoice numbering counter for", TENANT_ID);
}

async function ensureBankAccounts() {
  const existing = await BankAccount.find({ tenantId: TENANT_ID });
  if (existing.length > 0) {
    // Backfill upiId onto pre-existing seed bank accounts (additive field) so the UPI QR renders.
    for (const b of existing) {
      if (!b.upiId) {
        b.upiId = "aupulenstraders@okhdfcbank";
        await b.save();
      }
    }
    return BankAccount.find({ tenantId: TENANT_ID }).lean();
  }

  // Each bank account also needs a linked Chart-of-Accounts GL entry —
  // mirroring POST /api/finance/accounting/bank-accounts — otherwise it's
  // invisible to the Sales Payments "Deposit To" picker (which posts against
  // the GL account, not the BankAccount doc directly).
  const glType = await AccountType.findOne({ tenantId: TENANT_ID, name: "Bank" });
  async function linkedGlAccountId(accountName: string) {
    if (!glType) return undefined;
    let glAccount = await Account.findOne({ tenantId: TENANT_ID, accountName });
    if (!glAccount) {
      // Requires scripts/migrate-fix-account-legacy-code-index.ts to have
      // run first (fixes a stale non-partial unique index on {tenantId,
      // code} that otherwise collides on the first code-less Account).
      glAccount = await Account.create({
        tenantId: TENANT_ID,
        accountName,
        accountType: glType._id,
        createdBy: SEED_USER_ID,
        isActive: true,
      });
    }
    return glAccount._id;
  }

  const created = await BankAccount.insertMany([
    {
      tenantId: TENANT_ID,
      accountType: "bank",
      accountName: "HDFC Bank - Current Account",
      accountNumber: "50100123456789",
      bankName: "HDFC Bank",
      ifsc: "HDFC0000123",
      upiId: "aupulenstraders@okhdfcbank",
      currency: "INR",
      isPrimary: true,
      connectionStatus: "manual",
      glAccountId: await linkedGlAccountId("HDFC Bank - Current Account"),
      createdBy: SEED_USER_ID,
    },
    {
      tenantId: TENANT_ID,
      accountType: "bank",
      accountName: "ICICI Bank - Current Account",
      accountNumber: "00405001234567",
      bankName: "ICICI Bank",
      ifsc: "ICIC0004050",
      upiId: "aupulenstraders@okicici",
      currency: "INR",
      isPrimary: false,
      connectionStatus: "manual",
      glAccountId: await linkedGlAccountId("ICICI Bank - Current Account"),
      createdBy: SEED_USER_ID,
    },
  ]);
  console.log("Created", created.length, "bank accounts");
  return created;
}

async function ensureSignature() {
  const ds = await (DocumentSettings as any).findOne({ tenantId: TENANT_ID });
  if (!ds) throw new Error("DocumentSettings missing for default-tenant — run the app once to auto-create it.");
  if (!ds.signatures || ds.signatures.length === 0) {
    ds.signatures = [{ name: "Authorized Signatory", imageUrl: SAMPLE_PNG }] as any;
  }
  // The gallery/PDF renders the HSN summary and dispatch address only when
  // these Document Settings toggles are on — enable them so the seeded
  // invoices actually show every feature for visual review.
  ds.set("display.showHsnSummary", true);
  ds.set("display.showDispatchAddress", true);
  await ds.save();
  console.log("Signature + HSN-summary/dispatch-address display toggles ensured");
  return ds.signatures;
}

async function ensureCoupon() {
  const existing = await Coupon.findOne({ tenantId: TENANT_ID });
  if (existing) return existing;
  const coupon = await Coupon.create({
    tenantId: TENANT_ID,
    createdBy: SEED_USER_ID,
    name: "Welcome Discount",
    couponCode: "WELCOME10",
    description: "10% off for new customers",
    discountType: "order-level",
    applicableProducts: "all",
    applicableItems: "all",
    redemptionType: "unlimited",
    discountBy: "percentage",
    discountValue: 10,
    currency: "INR",
    eligibleCustomers: "all",
    minimumOrderAmount: 0,
    maximumRedemptions: { type: "unlimited" },
    maximumRedemptionsPerCustomer: { type: "unlimited" },
    neverExpires: true,
  });
  console.log("Created coupon WELCOME10");
  return coupon;
}

async function ensureCustomers() {
  // Fill in the GST state on the 3 pre-existing generic demo customers so
  // they can drive real CGST/SGST-vs-IGST scenarios (additive — only sets
  // fields that are currently empty, no existing data is overwritten).
  const stateByName: Record<string, { state: string; city: string }> = {
    "Apex Global Corp": { state: "Maharashtra", city: "Mumbai" }, // same state as seller -> CGST+SGST
    "Zenith Services LLC": { state: "Karnataka", city: "Bengaluru" }, // different state -> IGST
    "Alpha Distributing": { state: "Delhi", city: "New Delhi" }, // different state -> IGST
  };
  const existing = await Customer.find({ tenantId: TENANT_ID, "header.name": { $in: Object.keys(stateByName) } });
  for (const c of existing) {
    const info = stateByName[c.header.name];
    if (info && !c.address_tab?.state_name) {
      c.address_tab = { ...(c.address_tab as any), state_name: info.state, city: info.city, type: c.address_tab?.type || "contact" };
      await c.save();
    }
    if (info && !c.shipping_address?.state_name) {
      c.shipping_address = { street: "Warehouse Gate 3", city: info.city, state_name: info.state } as any;
      await c.save();
    }
  }

  const newCustomerDefs = [
    { name: "Meridian Business Solutions", state: "Maharashtra", city: "Pune", email: "accounts@meridianbiz.example" },
    { name: "Coastal Retail Traders", state: "Gujarat", city: "Ahmedabad", email: "purchase@coastalretail.example" },
  ];
  for (const def of newCustomerDefs) {
    const doc = await Customer.findOne({ tenantId: TENANT_ID, "header.name": def.name });
    if (!doc) {
      await Customer.create({
        tenantId: TENANT_ID,
        createdBy: SEED_USER_ID,
        header: { name: def.name, is_company: true },
        contact_details: { email: def.email, phone: "+919800000000" },
        address_tab: { type: "contact", city: def.city, state_name: def.state },
        shipping_address: { street: "Warehouse Gate 1", city: def.city, state_name: def.state },
      });
      console.log("Created customer:", def.name);
    }
  }

  return Customer.find({ tenantId: TENANT_ID }).lean();
}

function pick<T>(arr: T[], name: string): T {
  const found = (arr as any[]).find((x) => x.header?.name === name);
  if (!found) throw new Error(`Expected seed dependency "${name}" not found`);
  return found;
}

async function main() {
  await connectDB();
  console.log("Connected. Seeding invoices for tenant:", TENANT_ID);

  await ensureSellerProfile();
  await ensureInvoiceTemplatesSeeded();
  await ensureDefaultPrefixes(TENANT_ID);
  await ensureInvoicePrefixHasDash();
  await resetInvoiceCounter();
  const banks = await ensureBankAccounts();
  const signatures = await ensureSignature();
  await ensureCoupon();
  const customers = await ensureCustomers();
  const products = await Product.find({ tenantId: TENANT_ID }).lean();

  if (products.length < 3) throw new Error("Expected at least 3 seed products for default-tenant.");

  const cloud = products.find((p: any) => p.tab_general_information?.default_code === "PRD-CLOUD");
  const consulting = products.find((p: any) => p.tab_general_information?.default_code === "PRD-CONS");
  const server = products.find((p: any) => p.tab_general_information?.default_code === "PRD-SRV");

  const apex = pick(customers, "Apex Global Corp"); // Maharashtra
  const zenith = pick(customers, "Zenith Services LLC"); // Karnataka
  const alpha = pick(customers, "Alpha Distributing"); // Delhi
  const meridian = pick(customers, "Meridian Business Solutions"); // Maharashtra
  const coastal = pick(customers, "Coastal Retail Traders"); // Gujarat

  const bank = banks[0] as any;
  const signature = (signatures as any)[0];

  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000);
  const daysFromNow = (n: number) => new Date(today.getTime() + n * 86400000);

  const deleted = await (SalesInvoice as any).deleteMany({ tenantId: TENANT_ID });
  console.log(`Removed ${deleted.deletedCount} existing seed invoices for ${TENANT_ID}`);

  interface Spec {
    customer: any;
    invoiceDate: Date;
    dueDate: Date;
    templateKey: string;
    lineItems: any[];
    itemLevelDiscountPercent?: number;
    additionalCharges?: any[];
    extraDiscount?: number;
    extraDiscountMode?: "amount" | "percent";
    roundOff?: boolean;
    tds?: number;
    tcs?: number;
    payments?: any[];
    markedFullyPaid?: boolean;
    requestedStatus: string;
    notes?: string;
    terms?: string;
    eWaybill?: boolean;
    eInvoice?: boolean;
    attachments?: any[];
    coupons?: string[];
    withBank?: boolean;
    withSignature?: boolean;
    placeOfSupplyOverride?: string;
  }

  // One invoice per active template — exactly the 9 currently in scope.
  const specs: Spec[] = [
    {
      // Modern — same state as seller -> CGST+SGST. Fully paid in one shot.
      customer: apex,
      invoiceDate: daysAgo(20),
      dueDate: daysAgo(6),
      templateKey: "modern",
      lineItems: [
        { name: cloud.header.name, itemId: cloud._id, hsn: "998314", qty: 2, unitPrice: 1200, discount: 5, discountMode: "percent", taxRate: 18 },
        { name: consulting.header.name, itemId: consulting._id, hsn: "998313", qty: 3, unitPrice: 2500, discount: 0, discountMode: "percent", taxRate: 18 },
      ],
      roundOff: true,
      payments: [{ notes: "Full settlement", amount: 9642, date: daysAgo(5), mode: "Bank" }],
      markedFullyPaid: true,
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      notes: "Thanks for your business.",
      terms: "Payment due within 15 days. Late payments subject to 1.5% monthly interest.",
      withBank: true,
      withSignature: true,
    },
    {
      // Classic — same state, partial payment via 2 split payments + taxable & non-taxable additional charges.
      customer: meridian,
      invoiceDate: daysAgo(15),
      dueDate: daysFromNow(5),
      templateKey: "classic",
      lineItems: [
        { name: cloud.header.name, itemId: cloud._id, hsn: "998314", qty: 4, unitPrice: 1200, discount: 0, discountMode: "percent", taxRate: 18 },
        { name: consulting.header.name, itemId: consulting._id, hsn: "998313", qty: 1, unitPrice: 2500, discount: 200, discountMode: "amount", taxRate: 18 },
      ],
      additionalCharges: [
        { name: "Packing & Forwarding", amount: 300, isTaxable: true },
        { name: "Delivery (out of pocket)", amount: 150, isTaxable: false },
      ],
      payments: [
        { notes: "Advance", amount: 3000, date: daysAgo(14), mode: "UPI" },
        { notes: "Second installment", amount: 2000, date: daysAgo(2), mode: "Cash" },
      ],
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      withBank: true,
      withSignature: true,
    },
    {
      // Compact — different state -> IGST. Many line items, dense single-page demo.
      customer: zenith,
      invoiceDate: daysAgo(10),
      dueDate: daysFromNow(20),
      templateKey: "compact",
      lineItems: [
        { name: cloud.header.name, itemId: cloud._id, hsn: "998314", qty: 1, unitPrice: 1200, discount: 0, discountMode: "percent", taxRate: 18 },
        { name: consulting.header.name, itemId: consulting._id, hsn: "998313", qty: 2, unitPrice: 2500, discount: 5, discountMode: "percent", taxRate: 18 },
        { name: server.header.name, itemId: server._id, hsn: "84713010", qty: 1, unitPrice: 8500, discount: 10, discountMode: "percent", taxRate: 18 },
        { name: "Onsite Installation", hsn: "998719", qty: 1, unitPrice: 1500, discount: 0, discountMode: "percent", taxRate: 18 },
        { name: "Extended Warranty (1yr)", hsn: "998714", qty: 1, unitPrice: 900, discount: 0, discountMode: "percent", taxRate: 18 },
      ],
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      notes: "Thank you for choosing us.",
      terms: "Goods once sold will not be taken back.",
    },
    {
      // Evergreen — different state -> IGST. TCS + extra discount % + multi-HSN + attachment.
      customer: alpha,
      invoiceDate: daysAgo(5),
      dueDate: daysFromNow(25),
      templateKey: "evergreen",
      lineItems: [
        { name: server.header.name, itemId: server._id, hsn: "84713010", qty: 2, unitPrice: 8500, discount: 5, discountMode: "percent", taxRate: 18 },
        { name: cloud.header.name, itemId: cloud._id, hsn: "998314", qty: 5, unitPrice: 1200, discount: 0, discountMode: "percent", taxRate: 18 },
      ],
      extraDiscount: 2,
      extraDiscountMode: "percent",
      tcs: 1,
      attachments: [{ name: "purchase-order.png", url: SAMPLE_PNG }],
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      notes: "Reference: customer PO attached.",
      withBank: true,
    },
    {
      // Landscape — same state -> CGST+SGST. Fully paid via 2 exact split payments.
      customer: meridian,
      invoiceDate: daysAgo(30),
      dueDate: daysAgo(16),
      templateKey: "landscape",
      lineItems: [{ name: server.header.name, itemId: server._id, hsn: "84713010", qty: 1, unitPrice: 8500, discount: 0, discountMode: "percent", taxRate: 18 }],
      payments: [
        { notes: "Part 1", amount: 6000, date: daysAgo(25), mode: "Bank" },
        { notes: "Part 2 — balance", amount: 4030, date: daysAgo(18), mode: "Cash" },
      ],
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      withBank: true,
      withSignature: true,
    },
    {
      // Legend — different state -> IGST. Overdue, no payments — the full-bordered "official" look under stress.
      customer: coastal,
      invoiceDate: daysAgo(45),
      dueDate: daysAgo(15),
      templateKey: "legend",
      lineItems: [{ name: consulting.header.name, itemId: consulting._id, hsn: "998313", qty: 4, unitPrice: 2500, discount: 0, discountMode: "percent", taxRate: 18 }],
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      withBank: true,
      withSignature: true,
    },
    {
      // MRP + Discount — explicit different-state placeOfSupply override -> IGST + TDS. Shows MRP vs Selling Price columns.
      customer: apex,
      placeOfSupplyOverride: "Tamil Nadu",
      invoiceDate: daysAgo(8),
      dueDate: daysFromNow(12),
      templateKey: "mrp_discount",
      lineItems: [
        { name: cloud.header.name, itemId: cloud._id, hsn: "998314", qty: 3, unitPrice: 1200, discount: 15, discountMode: "percent", taxRate: 18 },
        { name: server.header.name, itemId: server._id, hsn: "84713010", qty: 1, unitPrice: 8500, discount: 500, discountMode: "amount", taxRate: 18 },
      ],
      tds: 10,
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      terms: "TDS as applicable under Section 194J will be deducted by the buyer.",
    },
    {
      // Service — draft, minimal/incomplete, exercises draft save+resume fidelity.
      customer: coastal,
      invoiceDate: today,
      dueDate: daysFromNow(30),
      templateKey: "service",
      lineItems: [{ name: consulting.header.name, itemId: consulting._id, hsn: "998313", qty: 1, unitPrice: 2500, discount: 0, discountMode: "percent", taxRate: 18 }],
      requestedStatus: SALES_INVOICE_STATUS.DRAFT,
      notes: "Draft — pricing to be confirmed with customer.",
    },
    {
      // Bill To - Ship To — different state -> IGST. e-Waybill + e-Invoice + coupon.
      customer: alpha,
      invoiceDate: daysAgo(1),
      dueDate: daysFromNow(29),
      templateKey: "bill_ship",
      lineItems: [{ name: cloud.header.name, itemId: cloud._id, hsn: "998314", qty: 10, unitPrice: 1200, discount: 10, discountMode: "percent", taxRate: 18 }],
      eWaybill: true,
      eInvoice: true,
      coupons: ["WELCOME10"],
      requestedStatus: SALES_INVOICE_STATUS.SAVED,
      withSignature: true,
      withBank: true,
    },
  ];

  const org = await Organization.findOne({ subdomain: TENANT_ID }).lean();
  const sellerState = (org as any)?.settings?.state;

  const results: any[] = [];
  for (const spec of specs) {
    const placeOfSupply = spec.placeOfSupplyOverride || spec.customer.address_tab?.state_name || sellerState;

    const totals = computeInvoiceTotals({
      lineItems: spec.lineItems,
      itemLevelDiscountPercent: spec.itemLevelDiscountPercent || 0,
      additionalCharges: spec.additionalCharges || [],
      extraDiscount: spec.extraDiscount || 0,
      extraDiscountMode: spec.extraDiscountMode || "amount",
      roundOff: !!spec.roundOff,
      sellerState,
      placeOfSupply,
      tdsRate: spec.tds || 0,
      tcsRate: spec.tcs || 0,
    });

    const { number } = await generateInvoiceNumber(TENANT_ID);

    const status = resolveInvoiceStatus({
      requestedStatus: spec.requestedStatus,
      totalAmount: totals.totalAmount,
      payments: spec.payments || [],
      markedFullyPaid: !!spec.markedFullyPaid,
      dueDate: spec.dueDate,
    });

    const invoice = new SalesInvoice({
      tenantId: TENANT_ID,
      number,
      type: "Regular",
      customerId: spec.customer._id,
      invoiceDate: spec.invoiceDate,
      dueDate: spec.dueDate,
      placeOfSupply,
      lineItems: spec.lineItems.map((li, i) => ({ ...li, lineTotal: totals.computedLines[i].lineTotal })),
      itemLevelDiscountPercent: spec.itemLevelDiscountPercent || 0,
      additionalCharges: spec.additionalCharges || [],
      extraDiscount: spec.extraDiscount || 0,
      roundOff: !!spec.roundOff,
      taxableAmount: totals.taxableAmount,
      totalDiscount: totals.totalDiscount,
      totalAmount: totals.totalAmount,
      taxes: { tds: spec.tds || 0, tcs: spec.tcs || 0, gstBreakup: totals.gstBreakup },
      bankAccountId: spec.withBank ? bank?._id : undefined,
      payments: spec.payments || [],
      markedFullyPaid: !!spec.markedFullyPaid,
      signatureId: spec.withSignature && signature ? String(signature._id ?? "") : undefined,
      notes: spec.notes || "",
      terms: spec.terms || "",
      eWaybill: !!spec.eWaybill,
      eInvoice: !!spec.eInvoice,
      attachments: spec.attachments || [],
      coupons: spec.coupons || [],
      templateKey: spec.templateKey,
      status,
      createdBy: SEED_USER_ID,
    });

    await invoice.save();
    results.push({ number: invoice.number, customer: spec.customer.header.name, template: spec.templateKey, status: invoice.status, total: invoice.totalAmount, placeOfSupply });
  }

  console.log("\nSeeded", results.length, "invoices (one per active template):\n");
  console.table(results);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

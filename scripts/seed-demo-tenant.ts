/**
 * The AI-native demo tenant (docs/ai/BRIEF-10-PRE-QA.md Part B.1) — a dedicated tenant, separate
 * from `default-tenant`'s general app demo data, built specifically so all 30 AI-XX workflows have
 * real signal to work with: recurring vendor patterns, distinct customer payment behaviours, bank
 * statements, stock movement, payroll, schedules — spanning 12 months of history plus the current
 * (partial) month, generated relative to whenever this script actually runs, not a hardcoded date.
 *
 * Also plants 8 deliberate findings the workflows should catch. What exactly was planted, and
 * where, is documented separately in docs/ai/PLANTED_FINDINGS.md — a file the test team does not
 * get (their own document, docs/ai/AI_Workflow_Test.md, says what to look FOR; this script and
 * that doc say what is definitely THERE, so the actual detection can be verified rather than
 * assumed).
 *
 * Idempotent by tenant: running twice without a reset first is refused (see checkNotAlreadySeeded)
 * — this script always builds a fresh, internally-consistent dataset; partial re-seeding would
 * corrupt the deliberately-planted signal. Use `npm run seed:ai-demo:reset` first if re-seeding.
 *
 * Usage: npx tsx scripts/seed-demo-tenant.ts
 * Requires MONGODB_URI in .env (same as the running app).
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";

import Organization from "../models/admin/Organization";
import User from "../models/auth/User";
import Customer from "../models/sales/Customer";
import Account from "../models/finance/Account";
import Invoice from "../models/finance/Invoice";
import JournalEntry from "../models/finance/JournalEntry";
import BankStatement from "../models/finance/BankStatement";
import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_STATUS, AI_SCHEDULE_PERIOD_STATUS } from "../models/ai/AiSchedule";
import Asset from "../models/finance/Asset";
import PurchaseOrder from "../models/finance/PurchaseOrder";
import Product from "../models/inventory/Product";
import Stock from "../models/inventory/Stock";
import StockMove from "../models/inventory/StockMove";
import Payroll from "../models/hr/Payroll";
import Employee from "../models/hr/Employee";
import AiMaterialityPolicy from "../models/ai/AiMaterialityPolicy";
import { seedChartOfAccounts } from "../lib/accounting/coa-seeder";
import { DOCUMENT_STATUS, PAYROLL_STATUS, PRODUCT_STATUS } from "../lib/constants/statuses";

export const TENANT_ID = "ai-demo-tenant";
const MONTHS_OF_HISTORY = 12; // + the current (partial) month = 13 periods total
const SEED_USER_ID = new mongoose.Types.ObjectId();
const ORG_OWNER_ID = new mongoose.Types.ObjectId();

// ── Time: every date below is relative to whenever this script runs, never hardcoded ──────────
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthsAgo(n: number, from = new Date()): { year: number; month: number; start: Date; end: Date; key: string } {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - n, 1));
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { year, month, start, end, key: monthKey(start) };
}
// Index 0 = 12 months ago ... index 12 = current month. 13 periods, MONTHS_OF_HISTORY apart.
const PERIODS = Array.from({ length: MONTHS_OF_HISTORY + 1 }, (_, i) => monthsAgo(MONTHS_OF_HISTORY - i));
const CURRENT = PERIODS[PERIODS.length - 1];
const dateInMonth = (p: { start: Date }, dayOfMonth: number) => new Date(Date.UTC(p.start.getUTCFullYear(), p.start.getUTCMonth(), dayOfMonth, 10, 0, 0));

async function checkNotAlreadySeeded() {
  const existing = await Organization.findOne({ subdomain: TENANT_ID }).lean();
  if (existing) {
    console.error(`Tenant "${TENANT_ID}" already exists. Run "npx tsx scripts/reset-demo-tenant.ts" first, then re-seed.`);
    process.exit(1);
  }
}

async function ensureOrgAndUser() {
  await User.create({
    _id: SEED_USER_ID,
    tenantId: TENANT_ID,
    name: "Demo Finance User",
    email: `demo-finance-${TENANT_ID}@example.com`,
    phone: "9800000001",
    password: "seeded-not-a-real-login",
    role: "finance",
    status: "active",
  });
  await Organization.create({
    name: "Aupulens AI Demo Co",
    subdomain: TENANT_ID,
    ownerUserId: ORG_OWNER_ID,
    isActive: true,
  });
  console.log(`Organization + seed user created for tenant "${TENANT_ID}".`);
}

// ── Chart of accounts: the 24 defaults, plus a few extra expense/asset accounts the defaults
// don't cover, needed for realistic bill categorisation and the capitalisation-consistency plant.
async function ensureAccounts() {
  await seedChartOfAccounts(TENANT_ID, String(SEED_USER_ID));

  const extra: { code: string; name: string; account_type: string; internal_group: string }[] = [
    { code: "1350", name: "Prepaid Expenses", account_type: "asset_current", internal_group: "asset" },
    { code: "5400", name: "Rent Expense", account_type: "expense", internal_group: "expense" },
    { code: "5410", name: "Utilities Expense", account_type: "expense", internal_group: "expense" },
    { code: "5420", name: "Software & Subscriptions", account_type: "expense", internal_group: "expense" },
    { code: "5430", name: "Professional Fees", account_type: "expense", internal_group: "expense" },
    { code: "5440", name: "Office Supplies", account_type: "expense", internal_group: "expense" },
    { code: "5450", name: "Freight & Logistics", account_type: "expense", internal_group: "expense" },
  ];
  for (const a of extra) {
    const existing = await Account.findOne({ tenantId: TENANT_ID, code: a.code });
    if (existing) continue;
    await Account.create({ tenantId: TENANT_ID, code: a.code, name: a.name, account_type: a.account_type, internal_group: a.internal_group, createdBy: SEED_USER_ID, isSystemSeeded: false });
  }

  const all = await Account.find({ tenantId: TENANT_ID }).lean();
  const byCode = new Map(all.map((a) => [a.code, a]));
  console.log(`Chart of accounts: ${all.length} accounts.`);
  return byCode;
}

async function ensureMaterialityPolicy() {
  await AiMaterialityPolicy.create({
    tenantId: TENANT_ID,
    thresholds: [
      { appliesTo: "capitalisation", absoluteAmount: 50000 },
      { appliesTo: "flux_analysis", absoluteAmount: 5000, percentOfBalance: 10 },
      { appliesTo: "bank", absoluteAmount: 100 },
      { appliesTo: "ap_control", absoluteAmount: 500 },
      { appliesTo: "ar_control_finance", absoluteAmount: 500 },
      { appliesTo: "receivables_collection", absoluteAmount: 5000 },
      { appliesTo: "accrual", absoluteAmount: 2000 },
      { appliesTo: "prepaid_recognition", absoluteAmount: 1000 },
    ],
  });
  console.log("Materiality policy configured (8 thresholds).");
}

// ── Parties. This codebase's finance module uses one unified `Customer` ("partner") model for
// both sales-role and purchase-role parties (Invoice.partnerId refs Customer even for vendor
// bills, moveType: "in_invoice" — CLAUDE.md's own documented, intentional Odoo-style design).
// "Vendors" below are therefore Customer records used in a purchase role, not models/admin/Vendor
// (a separate, lightweight directory the AI workflows never read).
interface PartyDef {
  key: string;
  name: string;
  state: string;
  city: string;
  gstin?: string;
  role: "vendor" | "customer";
}
const PARTY_DEFS: PartyDef[] = [
  // Recurring vendors (monthly bills every period)
  { key: "landlord", name: "Skyline Business Park LLP", state: "Maharashtra", city: "Pune", gstin: "27AAAFS1111A1Z1", role: "vendor" },
  { key: "saas", name: "CloudStack SaaS Solutions Pvt Ltd", state: "Karnataka", city: "Bengaluru", gstin: "29AABCC2222B1Z2", role: "vendor" },
  { key: "utility", name: "Metro Power & Utilities Board", state: "Maharashtra", city: "Pune", gstin: "27AAACM3333C1Z3", role: "vendor" },
  // One-off / occasional vendors
  { key: "hardware", name: "Apex Hardware Traders", state: "Gujarat", city: "Ahmedabad", gstin: "24AABCA4444D1Z4", role: "vendor" },
  { key: "freight", name: "Bharat Freight Logistics", state: "Maharashtra", city: "Mumbai", gstin: "27AABCB5555E1Z5", role: "vendor" },
  // Related-party plant (#7) — purchase-role half
  { key: "relatedVendor", name: "Sunrise Consulting Associates", state: "Maharashtra", city: "Pune", gstin: "27AABCS6666F1Z6", role: "vendor" },
  // Customers, each with a distinct payment behaviour
  { key: "prompt", name: "Meridian Business Solutions", state: "Maharashtra", city: "Pune", gstin: "27AABCM7777G1Z7", role: "customer" },
  { key: "late", name: "Coastal Retail Traders", state: "Gujarat", city: "Surat", gstin: "24AABCC8888H1Z8", role: "customer" },
  { key: "disputer", name: "Zenith Apparel Exports", state: "Tamil Nadu", city: "Tirupur", gstin: "33AABCZ9999I1Z9", role: "customer" },
  { key: "newcust", name: "Alpha Distributing Co", state: "Delhi", city: "New Delhi", gstin: "07AABCA1010J1Z1", role: "customer" },
  { key: "normal", name: "Nightingale Health Systems", state: "Karnataka", city: "Mysuru", gstin: "29AABCN2020K1Z2", role: "customer" },
  // Related-party plant (#7) — sales-role half, SAME gstin as "relatedVendor" above, different name
  { key: "relatedCustomer", name: "Sunrise Family Trust Holdings", state: "Maharashtra", city: "Pune", gstin: "27AABCS6666F1Z6", role: "customer" },
];

async function ensureParties(): Promise<Map<string, mongoose.Types.ObjectId>> {
  const ids = new Map<string, mongoose.Types.ObjectId>();
  for (const p of PARTY_DEFS) {
    const doc = await Customer.create({
      tenantId: TENANT_ID,
      createdBy: SEED_USER_ID,
      header: { name: p.name, is_company: true },
      contact_details: { email: `${p.key}@${p.key}.example`, phone: "+9198" + String(Math.floor(Math.random() * 90000000 + 10000000)) },
      address_tab: { type: "contact", city: p.city, state_name: p.state },
      shipping_address: { street: "1 Business Park", city: p.city, state_name: p.state },
      gstin: p.gstin,
      currency: "INR",
      openingBalance: 0,
      portalEnabled: false,
      addresses: [
        { type: "billing", isPrimary: true, city: p.city, state_name: p.state, country: "India" },
        { type: "shipping", isPrimary: true, city: p.city, state_name: p.state, country: "India" },
      ],
      contactPersons: [{ firstName: p.name.split(" ")[0], lastName: "Contact", email: `${p.key}@${p.key}.example`, designation: "Accounts" }],
    } as any);
    ids.set(p.key, doc._id as mongoose.Types.ObjectId);
  }
  console.log(`Parties: ${ids.size} Customer records (vendor + customer roles).`);
  return ids;
}

let billCounter = 0;
let invCounter = 0;
let jeCounter = 0;

async function postBill(params: {
  parties: Map<string, mongoose.Types.ObjectId>;
  partyKey: string;
  date: Date;
  dueDate: Date;
  amount: number;
  description: string;
  expenseAccountId: mongoose.Types.ObjectId | string;
  apAccountId: mongoose.Types.ObjectId | string;
  cashAccountId: mongoose.Types.ObjectId | string;
  paid: boolean;
  // AI-15's amount_outlier detector only evaluates lines whose createdAt falls in its rolling
  // 24h lookback window (lib/aiRuntime/workflows/ai-15-anomaly-detection/index.ts's
  // LOOKBACK_HOURS) against a historical baseline built from OLDER createdAt values — so a
  // genuinely-anomalous plant needs a real, current createdAt, not backdated to match its own
  // header.date the way every other (non-anomalous) historical entry in this seed is. Defaults to
  // true (the normal case, and the backdated_posting fix from Chunk 10a).
  backdateJournalTimestamps?: boolean;
}) {
  billCounter++;
  const name = `BILL-${TENANT_ID}-${String(billCounter).padStart(4, "0")}`;
  const bill = await Invoice.create({
    tenantId: TENANT_ID,
    name,
    partnerId: params.parties.get(params.partyKey),
    moveType: "in_invoice",
    invoiceDate: params.date,
    dueDate: params.dueDate,
    state: DOCUMENT_STATUS.POSTED,
    invoiceLines: [{ name: params.description, quantity: 1, priceUnit: params.amount, priceSubtotal: params.amount, taxIds: [], accountId: params.expenseAccountId }],
    currencyId: "INR",
    amountUntaxed: params.amount,
    amountTax: 0,
    amountTotal: params.amount,
    amountResidual: params.paid ? 0 : params.amount,
    paymentState: params.paid ? "paid" : "not_paid",
    createdBy: SEED_USER_ID,
  } as any);

  jeCounter++;
  const backdate = params.backdateJournalTimestamps !== false;
  await JournalEntry.create({
    tenantId: TENANT_ID,
    header: { name: `JE-${jeCounter}-${name}`, date: params.date, journalType: "purchase", ref: `bill:${bill._id}` },
    status: DOCUMENT_STATUS.POSTED,
    voucherStatus: "posted",
    voucherType: "purchase",
    // AI-15's per-vendor amount_outlier baseline is keyed `${partnerId}:${accountId}` off each
    // line's own partnerId — without it, every line here is invisible to that detector
    // regardless of amount, since there is no vendor to group by at all (Chunk 10a).
    lineIds: [
      { accountId: params.expenseAccountId, label: params.description, debit: params.amount, credit: 0, partnerId: params.parties.get(params.partyKey) },
      { accountId: params.apAccountId, label: params.description, debit: 0, credit: params.amount, partnerId: params.parties.get(params.partyKey) },
    ],
    totals: { amountUntaxed: params.amount, amountTax: 0, amountTotal: params.amount },
    createdBy: SEED_USER_ID,
    // AI-15's backdated_posting detector compares header.date against createdAt — without this,
    // every historical entry in a bulk seed (all genuinely posted "now") would look backdated by
    // months, drowning out the one real anomaly this tenant plants (Chunk 10a). The anomaly bill
    // itself opts out (backdateJournalTimestamps: false) — Mongoose's own default (actual
    // insertion time) is exactly what amount_outlier's 24h lookback window needs to see it.
    ...(backdate ? { createdAt: params.date, updatedAt: params.date } : {}),
  } as any);

  if (params.paid) {
    jeCounter++;
    const payDate = new Date(params.date.getTime() + 3 * 86400000);
    await JournalEntry.create({
      tenantId: TENANT_ID,
      header: { name: `JE-${jeCounter}-${name}-PAY`, date: payDate, journalType: "bank", ref: `bill-payment:${bill._id}` },
      status: DOCUMENT_STATUS.POSTED,
      voucherStatus: "posted",
      voucherType: "payment",
      lineIds: [
        { accountId: params.apAccountId, label: `Payment: ${params.description}`, debit: params.amount, credit: 0, sourceId: bill._id },
        { accountId: params.cashAccountId, label: `Payment: ${params.description}`, debit: 0, credit: params.amount, sourceId: bill._id },
      ],
      totals: { amountUntaxed: params.amount, amountTax: 0, amountTotal: params.amount },
      createdAt: payDate,
      updatedAt: payDate,
      createdBy: SEED_USER_ID,
    } as any);
  }
  return bill;
}

async function postCustomerInvoice(params: {
  parties: Map<string, mongoose.Types.ObjectId>;
  partyKey: string;
  date: Date;
  dueDate: Date;
  amount: number;
  description: string;
  incomeAccountId: mongoose.Types.ObjectId | string;
  arAccountId: mongoose.Types.ObjectId | string;
  cashAccountId: mongoose.Types.ObjectId | string;
  paidAmount: number; // 0 = unpaid, < amount = short/partial, === amount = fully paid
  paymentDate?: Date;
}) {
  invCounter++;
  const name = `INV-${TENANT_ID}-${String(invCounter).padStart(4, "0")}`;
  const residual = params.amount - params.paidAmount;
  const paymentState = residual <= 0 ? "paid" : params.paidAmount > 0 ? "partial" : "not_paid";
  const inv = await Invoice.create({
    tenantId: TENANT_ID,
    name,
    partnerId: params.parties.get(params.partyKey),
    moveType: "out_invoice",
    invoiceDate: params.date,
    dueDate: params.dueDate,
    state: DOCUMENT_STATUS.POSTED,
    invoiceLines: [{ name: params.description, quantity: 1, priceUnit: params.amount, priceSubtotal: params.amount, taxIds: [], accountId: params.incomeAccountId }],
    currencyId: "INR",
    amountUntaxed: params.amount,
    amountTax: 0,
    amountTotal: params.amount,
    amountResidual: Math.max(0, residual),
    paymentState,
    createdBy: SEED_USER_ID,
  } as any);

  jeCounter++;
  await JournalEntry.create({
    tenantId: TENANT_ID,
    header: { name: `JE-${jeCounter}-${name}`, date: params.date, journalType: "sale", ref: `invoice:${inv._id}` },
    status: DOCUMENT_STATUS.POSTED,
    voucherStatus: "posted",
    voucherType: "sales",
    lineIds: [
      { accountId: params.arAccountId, label: params.description, debit: params.amount, credit: 0 },
      { accountId: params.incomeAccountId, label: params.description, debit: 0, credit: params.amount },
    ],
    totals: { amountUntaxed: params.amount, amountTax: 0, amountTotal: params.amount },
    createdBy: SEED_USER_ID,
    createdAt: params.date,
    updatedAt: params.date,
  } as any);

  if (params.paidAmount > 0) {
    jeCounter++;
    const receiptDate = params.paymentDate ?? new Date(params.date.getTime() + 5 * 86400000);
    await JournalEntry.create({
      tenantId: TENANT_ID,
      header: { name: `JE-${jeCounter}-${name}-RCPT`, date: receiptDate, journalType: "bank", ref: `invoice-receipt:${inv._id}` },
      status: DOCUMENT_STATUS.POSTED,
      voucherStatus: "posted",
      voucherType: "receipt",
      lineIds: [
        { accountId: params.cashAccountId, label: `Receipt: ${params.description}`, debit: params.paidAmount, credit: 0 },
        { accountId: params.arAccountId, label: `Receipt: ${params.description}`, debit: 0, credit: params.paidAmount },
      ],
      totals: { amountUntaxed: params.paidAmount, amountTax: 0, amountTotal: params.paidAmount },
      createdBy: SEED_USER_ID,
      createdAt: receiptDate,
      updatedAt: receiptDate,
    } as any);
  }
  return inv;
}

async function seedVendorBills(parties: Map<string, mongoose.Types.ObjectId>, acc: Map<string, any>) {
  const cash = acc.get("1120")!._id; // Bank Current Account
  const ap = acc.get("2100")!._id; // Accounts Payable
  const rent = acc.get("5400")!._id;
  const software = acc.get("5420")!._id;
  const utilities = acc.get("5410")!._id;
  const professional = acc.get("5430")!._id;
  const hardware = acc.get("5440")!._id;
  const freight = acc.get("5450")!._id;

  // Recurring: landlord (flat), SaaS vendor (flat, except ONE anomalous spike — plant #3), utility
  // (naturally variable, seasonal-ish).
  for (const p of PERIODS) {
    await postBill({ parties, partyKey: "landlord", date: dateInMonth(p, 1), dueDate: dateInMonth(p, 10), amount: 45000, description: "Monthly office rent", expenseAccountId: rent, apAccountId: ap, cashAccountId: cash, paid: p.key !== CURRENT.key });

    // Plant #3 — genuine anomaly: this SaaS vendor bills a steady ₹8,500/month for 11 months,
    // then spikes to ₹92,000 two months ago with no corresponding change in service — a real,
    // detectable outlier against its own tight historical pattern (AI-15's territory).
    const isAnomalyMonth = p.key === PERIODS[PERIODS.length - 3].key;
    // AI-15's amount_outlier detector (see postBill's own doc comment) only evaluates entries
    // whose createdAt is genuinely recent (last 24h) against an older baseline — this one opts
    // out of the backdating fix so it actually falls in that window when this seed runs.
    // A small amount of natural month-to-month variance (±~150) is deliberate, not noise: AI-15's
    // amount_outlier detector requires a real stddev > 0.01 in the historical population before
    // it will even compute a z-score at all (a perfectly flat ₹8,500-every-month history has zero
    // variance, so the check never activates) — this is what makes the eventual ₹92,000 spike a
    // real, many-sigma outlier against a real (if tight) baseline, not an artefact of a synthetic
    // flat-line dataset.
    const saasAmount = isAnomalyMonth ? 92000 : 8500 + Math.round((Math.random() - 0.5) * 300);
    await postBill({ parties, partyKey: "saas", date: dateInMonth(p, 3), dueDate: dateInMonth(p, 15), amount: saasAmount, description: isAnomalyMonth ? "Annual plan true-up (unexplained)" : "Monthly SaaS subscription", expenseAccountId: software, apAccountId: ap, cashAccountId: cash, paid: p.key !== CURRENT.key, backdateJournalTimestamps: !isAnomalyMonth });

    const utilityAmount = 12000 + Math.round(Math.sin((p.month / 12) * Math.PI * 2) * 3000);
    await postBill({ parties, partyKey: "utility", date: dateInMonth(p, 5), dueDate: dateInMonth(p, 20), amount: utilityAmount, description: "Monthly electricity & utilities", expenseAccountId: utilities, apAccountId: ap, cashAccountId: cash, paid: p.key !== CURRENT.key });
  }

  // One-off vendors, a few bills scattered across recent months.
  await postBill({ parties, partyKey: "hardware", date: dateInMonth(PERIODS[PERIODS.length - 4], 12), dueDate: dateInMonth(PERIODS[PERIODS.length - 4], 30), amount: 18500, description: "Replacement office equipment", expenseAccountId: hardware, apAccountId: ap, cashAccountId: cash, paid: true });
  await postBill({ parties, partyKey: "freight", date: dateInMonth(PERIODS[PERIODS.length - 2], 8), dueDate: dateInMonth(PERIODS[PERIODS.length - 2], 25), amount: 9200, description: "Outbound freight charges", expenseAccountId: freight, apAccountId: ap, cashAccountId: cash, paid: true });

  // Related-party plant (#7), purchase-role half: an ordinary-looking consulting bill.
  // detectRelatedParties() only builds its candidate pools from OPEN (unpaid) invoices on each
  // side (loadOpenBalances()'s real-exposure requirement) — left unpaid so this is a real
  // candidate, not paid-and-therefore-invisible to the detector.
  await postBill({ parties, partyKey: "relatedVendor", date: dateInMonth(PERIODS[PERIODS.length - 2], 14), dueDate: dateInMonth(CURRENT, 20), amount: 22000, description: "Strategic consulting services", expenseAccountId: professional, apAccountId: ap, cashAccountId: cash, paid: false });

  // Plant #1 — real duplicate bill: the exact same landlord bill, same amount, same date,
  // entered a second time (the classic double-keying mistake) two months ago.
  const dupMonth = PERIODS[PERIODS.length - 2];
  await postBill({ parties, partyKey: "landlord", date: dateInMonth(dupMonth, 1), dueDate: dateInMonth(dupMonth, 10), amount: 45000, description: "Monthly office rent", expenseAccountId: rent, apAccountId: ap, cashAccountId: cash, paid: true });

  // Plant #4 — cut-off error: evaluateCutoff() (lib/aiRuntime/cutoff/evaluateCutoff.ts) needs
  // real structural evidence to compare against — a PurchaseOrder's stock-move receipt date (or
  // failing that, its own dateOrder) versus the bill's own invoiceDate — not just a description
  // that says so. A bare Invoice with no PurchaseOrder link is `determinable: false` and AI-28 has
  // nothing to flag. Built for real here: goods genuinely received (StockMove.effectiveDate) in
  // the second-to-last month, but the vendor bill for them wasn't recorded until the 1st of the
  // CURRENT month — a real period-cutoff misclassification, not a business decision.
  const lateMonth = PERIODS[PERIODS.length - 2];
  // AI-28's own candidate window is periodEnd +/- WINDOW_DAYS (10) — only bills genuinely dated
  // near the period boundary are ever evaluated at all, so this must land inside that window
  // (day 25, not day 1) for the workflow to actually pick it up as a candidate.
  const cutoffBill = await postBill({ parties, partyKey: "freight", date: dateInMonth(CURRENT, 25), dueDate: dateInMonth(CURRENT, 20), amount: 14700, description: `Freight for deliveries completed ${lateMonth.key} (recorded late)`, expenseAccountId: freight, apAccountId: ap, cashAccountId: cash, paid: false });
  const cutoffStockMove = await StockMove.create({
    tenantId: TENANT_ID,
    reference: `GRN-${TENANT_ID}-CUTOFF`,
    moveType: "incoming",
    sourceLocation: {},
    destinationLocation: {},
    scheduledDate: dateInMonth(lateMonth, 27),
    effectiveDate: dateInMonth(lateMonth, 27),
    lines: [],
    moveStatus: "accounting_created",
    valuation: { method: "standard", totalValue: 14700 },
  } as any);
  await PurchaseOrder.create({
    tenantId: TENANT_ID,
    name: `PO-${TENANT_ID}-CUTOFF`,
    partnerId: parties.get("freight"),
    dateOrder: dateInMonth(lateMonth, 20),
    orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Freight service", productQty: 1, receivedQty: 1, billedQty: 1, priceUnit: 14700, taxIds: [], priceSubtotal: 14700 }],
    totals: { amountUntaxed: 14700, amountTax: 0, amountTotal: 14700 },
    status: DOCUMENT_STATUS.POSTED,
    invoiceIds: [cutoffBill._id],
    stockMoveIds: [cutoffStockMove._id],
    createdBy: SEED_USER_ID,
  } as any);

  // Plant #8 — policy inconsistency (capitalisation): two similar large equipment purchases
  // above the ₹50,000 materiality threshold, treated inconsistently. One correctly capitalised
  // (fixed asset account 1400) three months ago; the other, four months ago, wrongly expensed.
  const fixedAssets = acc.get("1400")!._id;
  await postBill({ parties, partyKey: "hardware", date: dateInMonth(PERIODS[PERIODS.length - 3], 5), dueDate: dateInMonth(PERIODS[PERIODS.length - 3], 25), amount: 68000, description: "Warehouse racking system (capitalised)", expenseAccountId: fixedAssets, apAccountId: ap, cashAccountId: cash, paid: true });
  await postBill({ parties, partyKey: "hardware", date: dateInMonth(PERIODS[PERIODS.length - 4], 9), dueDate: dateInMonth(PERIODS[PERIODS.length - 4], 29), amount: 71000, description: "Warehouse conveyor unit (expensed — inconsistent with the racking purchase above)", expenseAccountId: hardware, apAccountId: ap, cashAccountId: cash, paid: true });

  // Plant #2 — real duplicate payment: findDuplicatePaymentPostings()
  // (lib/aiRuntime/duplicates/detect.ts) detects this directly from lineIds[].sourceId — two
  // posted `payment`-voucherType JournalEntrys referencing the SAME bill, summing to more than
  // the bill's own total. postBill()'s own payment journal already tags sourceId (real bills
  // above rely on this too); a dedicated bill here, paid once normally, then paid a second time
  // by mistake a few days later — the real double-pay shape, not a second bill.
  const overpayAmount = 12500;
  const overpayBill = await postBill({ parties, partyKey: "utility", date: dateInMonth(PERIODS[PERIODS.length - 3], 5), dueDate: dateInMonth(PERIODS[PERIODS.length - 3], 20), amount: overpayAmount, description: "Emergency generator servicing", expenseAccountId: utilities, apAccountId: ap, cashAccountId: cash, paid: true });
  jeCounter++;
  const dupPayDate = dateInMonth(PERIODS[PERIODS.length - 3], 9);
  await JournalEntry.create({
    tenantId: TENANT_ID,
    header: { name: `JE-${jeCounter}-DUPLICATE-PAYMENT`, date: dupPayDate, journalType: "bank", ref: `bill-payment-duplicate:${overpayBill._id}` },
    status: DOCUMENT_STATUS.POSTED,
    voucherStatus: "posted",
    voucherType: "payment",
    lineIds: [
      { accountId: ap, label: "Duplicate payment: Emergency generator servicing", debit: overpayAmount, credit: 0, sourceId: overpayBill._id },
      { accountId: cash, label: "Duplicate payment: Emergency generator servicing", debit: 0, credit: overpayAmount, sourceId: overpayBill._id },
    ],
    totals: { amountUntaxed: overpayAmount, amountTax: 0, amountTotal: overpayAmount },
    createdBy: SEED_USER_ID,
    createdAt: dupPayDate,
    updatedAt: dupPayDate,
  } as any);

  console.log(`Vendor bills: ${billCounter} posted (incl. planted findings #1, #2, #3, #4, #8).`);
}

async function seedCustomerInvoices(parties: Map<string, mongoose.Types.ObjectId>, acc: Map<string, any>) {
  const cash = acc.get("1120")!._id;
  const ar = acc.get("1200")!._id;
  const income = acc.get("4100")!._id;

  for (const p of PERIODS) {
    const isCurrent = p.key === CURRENT.key;

    // Prompt payer: invoiced monthly, paid in full ~5 days after due date, every time.
    await postCustomerInvoice({ parties, partyKey: "prompt", date: dateInMonth(p, 2), dueDate: dateInMonth(p, 17), amount: 38000, description: "Monthly retainer services", incomeAccountId: income, arAccountId: ar, cashAccountId: cash, paidAmount: isCurrent ? 0 : 38000, paymentDate: dateInMonth(p, 22) });

    // Late payer: invoiced monthly; the last 3 months (incl. current) remain unpaid/overdue.
    const lateUnpaidStart = PERIODS.length - 3;
    const isLateUnpaid = PERIODS.indexOf(p) >= lateUnpaidStart;
    await postCustomerInvoice({ parties, partyKey: "late", date: dateInMonth(p, 4), dueDate: dateInMonth(p, 19), amount: 27500, description: "Monthly product supply", incomeAccountId: income, arAccountId: ar, cashAccountId: cash, paidAmount: isLateUnpaid ? 0 : 27500, paymentDate: dateInMonth(p, 40) });

    // Normal, well-behaved customer: monthly, paid on time.
    if (!isCurrent) {
      await postCustomerInvoice({ parties, partyKey: "normal", date: dateInMonth(p, 6), dueDate: dateInMonth(p, 21), amount: 21000, description: "Monthly service subscription", incomeAccountId: income, arAccountId: ar, cashAccountId: cash, paidAmount: 21000, paymentDate: dateInMonth(p, 20) });
    }
  }

  // Disputer: bimonthly invoices, one of which is genuinely short-paid (a real dispute, not a
  // data error) — AI-05's short_payment territory.
  for (let i = 0; i < PERIODS.length; i += 2) {
    const p = PERIODS[i];
    const isDisputed = i === PERIODS.length - 4 || i === PERIODS.length - 3; // the disputed invoice's period
    await postCustomerInvoice({
      parties,
      partyKey: "disputer",
      date: dateInMonth(p, 8),
      dueDate: dateInMonth(p, 23),
      amount: 54000,
      description: isDisputed ? "Bulk export order (quality dispute — partial payment only)" : "Bulk export order",
      incomeAccountId: income,
      arAccountId: ar,
      cashAccountId: cash,
      paidAmount: isDisputed ? 34000 : 54000,
      paymentDate: dateInMonth(p, 30),
    });
  }

  // New customer: onboarded this month only, no history at all yet.
  await postCustomerInvoice({ parties, partyKey: "newcust", date: dateInMonth(CURRENT, 3), dueDate: dateInMonth(CURRENT, 18), amount: 16000, description: "First order — onboarding package", incomeAccountId: income, arAccountId: ar, cashAccountId: cash, paidAmount: 0 });

  // Related-party plant (#7), sales-role half.
  // Same open-balance requirement as the purchase-role half above — left unpaid.
  await postCustomerInvoice({ parties, partyKey: "relatedCustomer", date: dateInMonth(PERIODS[PERIODS.length - 2], 11), dueDate: dateInMonth(CURRENT, 26), amount: 19500, description: "Advisory services rendered", incomeAccountId: income, arAccountId: ar, cashAccountId: cash, paidAmount: 0 });

  console.log(`Customer invoices: ${invCounter} posted (incl. planted finding #7's sales-role half).`);
}

// ── Bank statements: one per month against the Bank Current Account, reconciling to the GL for
// every month except one deliberate plant (#5).
async function seedBankStatements(acc: Map<string, any>) {
  const bankAccountId = acc.get("1120")!._id;
  let running = 500000; // opening balance
  let count = 0;
  for (const p of PERIODS) {
    const entries = await JournalEntry.find({ tenantId: TENANT_ID, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: p.start, $lte: p.end } })
      .select("lineIds")
      .lean();
    let netMovement = 0;
    for (const e of entries) {
      for (const l of e.lineIds ?? []) {
        if (String(l.accountId) === String(bankAccountId)) netMovement += (l.debit ?? 0) - (l.credit ?? 0);
      }
    }
    running += netMovement;

    // Plant #5 — unreconciled difference: the 3rd-to-last month's bank statement reports a
    // balance ₹4,300 different from what the GL says it should be (a real timing/data-entry gap,
    // not a rounding artefact) — AI-03/AI-22's territory.
    const isUnreconciledMonth = p.key === PERIODS[PERIODS.length - 3].key;
    const reportedBalance = isUnreconciledMonth ? running - 4300 : running;

    count++;
    await BankStatement.create({
      tenantId: TENANT_ID,
      header: { name: `STMT-${p.key}`, journalId: bankAccountId, date: p.end, balance_start: running - netMovement, balance_end_real: reportedBalance },
      lineIds: [],
      status: DOCUMENT_STATUS.POSTED,
    } as any);
  }
  console.log(`Bank statements: ${count} posted (incl. planted finding #5).`);
}

// ── Schedules: a prepaid insurance amortisation (with one deliberately stale period — plant #6)
// and an ordinary accrual-reversal schedule.
async function seedSchedules(acc: Map<string, any>) {
  const prepaidAsset = acc.get("1350")!._id;
  const professional = acc.get("5430")!._id;
  const rent = acc.get("5400")!._id;
  const ap = acc.get("2100")!._id;

  // Annual insurance, ₹60,000, amortising ₹5,000/month over 12 periods starting 10 months ago —
  // 10 periods already posted, 2 pending (last-but-one due 2 months ago, deliberately never
  // processed — the stale accrual plant; the final one due next month, genuinely still pending).
  const insuranceStart = PERIODS[PERIODS.length - 11];
  const periods = [];
  for (let i = 0; i < 12; i++) {
    const idx = PERIODS.length - 11 + i;
    const p = idx >= 0 && idx < PERIODS.length ? PERIODS[idx] : monthsAgo(-(i - 10));
    const isPast = idx >= 0 && idx <= PERIODS.length - 3; // everything except the last 2 "periods" is in the past
    periods.push({
      periodKey: p.key,
      dueDate: dateInMonth(p, 28),
      amount: 5000,
      status: isPast ? AI_SCHEDULE_PERIOD_STATUS.POSTED : AI_SCHEDULE_PERIOD_STATUS.PENDING,
    });
  }
  await AiSchedule.create({
    tenantId: TENANT_ID,
    scheduleType: AI_SCHEDULE_TYPE.PREPAID,
    sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId().toString() },
    status: AI_SCHEDULE_STATUS.APPROVED,
    startDate: dateInMonth(insuranceStart, 1),
    endDate: dateInMonth(PERIODS[PERIODS.length - 1], 28),
    frequency: "monthly",
    totalAmount: 60000,
    currency: "INR",
    debitAccountId: professional,
    creditAccountId: prepaidAsset,
    basis: "stated",
    periods,
    recognisedToDate: periods.filter((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.POSTED).length * 5000,
    remaining: periods.filter((p) => p.status !== AI_SCHEDULE_PERIOD_STATUS.POSTED).length * 5000,
    nextRunDate: periods.find((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING)?.dueDate,
    createdByWorkflow: "AI-08",
  } as any);

  // Plant #6 — stale accrual: a GRNI accrual reversal that fell due 2 months ago and was never
  // processed (AI-07/AI-13's territory).
  const stalePeriod = PERIODS[PERIODS.length - 2];
  await AiSchedule.create({
    tenantId: TENANT_ID,
    scheduleType: AI_SCHEDULE_TYPE.ACCRUAL_REVERSAL,
    sourceRef: { model: "PurchaseOrder", id: new mongoose.Types.ObjectId().toString() },
    status: AI_SCHEDULE_STATUS.APPROVED,
    startDate: dateInMonth(stalePeriod, 1),
    endDate: dateInMonth(stalePeriod, 28),
    frequency: "monthly",
    totalAmount: 15000,
    currency: "INR",
    debitAccountId: ap,
    creditAccountId: rent,
    basis: "inferred",
    periods: [{ periodKey: stalePeriod.key, dueDate: dateInMonth(stalePeriod, 28), amount: 15000, status: AI_SCHEDULE_PERIOD_STATUS.PENDING }],
    recognisedToDate: 0,
    remaining: 15000,
    nextRunDate: dateInMonth(stalePeriod, 28),
    createdByWorkflow: "AI-07",
  } as any);

  console.log("Schedules: 1 prepaid amortisation + 1 accrual reversal (incl. planted finding #6).");
}

async function seedFixedAsset(acc: Map<string, any>) {
  await Asset.create({
    tenantId: TENANT_ID,
    name: "Office furniture & fixtures",
    purchaseDate: dateInMonth(PERIODS[0], 5),
    originalValue: 180000,
    salvageValue: 18000,
    method: "linear",
    durationYears: 5,
    accounts: { assetAccountId: acc.get("1400")!._id, depreciationAccountId: acc.get("5300")!._id },
    status: DOCUMENT_STATUS.POSTED,
  } as any);
  console.log("Fixed asset: 1 posted (office furniture, 5-year linear depreciation).");
}

async function seedInventory() {
  const product = await Product.create({
    tenantId: TENANT_ID,
    createdBy: SEED_USER_ID,
    header: { name: "Packaging Roll (Standard)", sale_ok: true, purchase_ok: true, can_be_expensed: false },
    tab_general_information: { type: "consu", invoice_policy: "order", service_upsell: false, list_price: 450, taxes_id: [], standard_price: 300, default_code: "AI-DEMO-PKG", description: "Standard packaging roll" },
    status: PRODUCT_STATUS.PUBLISHED,
  } as any);

  let qty = 0;
  for (const p of PERIODS) {
    const received = 200 + Math.round(Math.random() * 40);
    qty += received;
    await Stock.create({ tenantId: TENANT_ID, product: product._id, quantity: received, type: "in", reference: `RCPT-${p.key}` });
    const consumed = Math.min(qty, 180 + Math.round(Math.random() * 30));
    qty -= consumed;
    await Stock.create({ tenantId: TENANT_ID, product: product._id, quantity: consumed, type: "out", reference: `SHIP-${p.key}` });
  }
  console.log(`Inventory: 1 product, ${PERIODS.length * 2} stock movements, ending quantity ${qty}.`);
}

async function seedPayroll() {
  const employees = [
    { code: "EMP-001", first: "Priya", last: "Sharma", basic: 45000 },
    { code: "EMP-002", first: "Arjun", last: "Mehta", basic: 38000 },
    { code: "EMP-003", first: "Kavya", last: "Reddy", basic: 52000 },
  ];
  const empDocs = [];
  for (const e of employees) {
    const doc = await Employee.create({
      tenantId: TENANT_ID,
      employeeCode: e.code,
      firstName: e.first,
      lastName: e.last,
      email: `${e.first.toLowerCase()}.${e.last.toLowerCase()}@${TENANT_ID}.example`,
      phone: "9800000" + Math.floor(Math.random() * 900 + 100),
      dateOfJoining: dateInMonth(PERIODS[0], 1),
      designation: "Staff",
      status: "active",
    } as any);
    empDocs.push({ doc, basic: e.basic });
  }

  let count = 0;
  for (const p of [PERIODS[PERIODS.length - 2], PERIODS[PERIODS.length - 1]]) {
    const lineItems = empDocs.map(({ doc, basic }) => {
      const hra = Math.round(basic * 0.4);
      const da = Math.round(basic * 0.1);
      const gross = basic + hra + da;
      const pf = Math.round(basic * 0.12);
      const tds = Math.round(gross * 0.05);
      const totalDeductions = pf + tds;
      return {
        employeeId: doc._id,
        employeeCode: doc.employeeCode,
        employeeName: `${doc.firstName} ${doc.lastName}`,
        basic,
        hra,
        da,
        specialAllowance: 0,
        grossSalary: gross,
        deductions: { pf, esi: 0, professionalTax: 200, tds, otherDeductions: 0, totalDeductions: totalDeductions + 200 },
        netSalary: gross - totalDeductions - 200,
        daysWorked: 30,
        daysAbsent: 0,
        overtime: 0,
      };
    });
    const totalGross = lineItems.reduce((s, l) => s + l.grossSalary, 0);
    const totalDeductions = lineItems.reduce((s, l) => s + l.deductions.totalDeductions, 0);
    await Payroll.create({
      tenantId: TENANT_ID,
      payrollCode: `PAY-${p.key}`,
      payrollPeriod: { month: p.month, year: p.year, startDate: p.start, endDate: p.end },
      lineItems,
      totals: { totalGross, totalDeductions, totalNet: totalGross - totalDeductions, totalOvertime: 0, totalLOP: 0, currency: "INR" },
      status: PAYROLL_STATUS.APPROVED,
      createdBy: SEED_USER_ID,
    } as any);
    count++;
  }
  console.log(`Payroll: ${empDocs.length} employees, ${count} payroll runs.`);
}

async function main() {
  await connectDB();
  await checkNotAlreadySeeded();
  console.log(`Seeding AI demo tenant "${TENANT_ID}" — ${PERIODS.length} periods, ${PERIODS[0].key} through ${CURRENT.key}.\n`);

  await ensureOrgAndUser();
  const acc = await ensureAccounts();
  await ensureMaterialityPolicy();
  const parties = await ensureParties();
  await seedVendorBills(parties, acc);
  await seedCustomerInvoices(parties, acc);
  await seedBankStatements(acc);
  await seedSchedules(acc);
  await seedFixedAsset(acc);
  await seedInventory();
  await seedPayroll();

  console.log("\nDemo tenant seed complete.");
  console.log(`Subdomain: ${TENANT_ID}`);
  console.log("See docs/ai/PLANTED_FINDINGS.md for what was deliberately planted (not for the test team).");

  await mongoose.disconnect();
}

// Guarded so `verify-planted-findings.ts` can import TENANT_ID without re-running the seed.
if (require.main === module) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

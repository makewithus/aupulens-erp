import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Account from "@/models/Account";
import Customer from "@/models/Customer";
import { SalesInvoice } from "@/models/SalesInvoice";
import JournalEntry from "@/models/JournalEntry";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { postSalesInvoiceJournal } from "@/lib/accounting/salesInvoicePosting";

const tenantId = "t-sales-invoice-posting";
const createdBy = new mongoose.Types.ObjectId().toString();

async function makeCustomer() {
  return Customer.create({
    tenantId,
    header: { name: "Invoice Posting Co", is_company: true },
    createdBy: new mongoose.Types.ObjectId(createdBy),
  });
}

async function makeInvoice(overrides: Partial<Record<string, any>> = {}) {
  const customer = overrides.customerId ? null : await makeCustomer();
  return (SalesInvoice as any).create({
    tenantId,
    number: `INV-POST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId: overrides.customerId || customer!._id,
    invoiceDate: new Date("2026-07-10"),
    dueDate: new Date("2026-07-20"),
    lineItems: [{ name: "Widget", qty: 1, unitPrice: 1000, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: 1000 }],
    taxableAmount: 1000,
    totalDiscount: 0,
    totalAmount: 1000,
    status: "saved",
    ...overrides,
  });
}

function sumByAccount(lines: any[], accountId: mongoose.Types.ObjectId, field: "debit" | "credit") {
  return lines
    .filter((l: any) => String(l.accountId) === String(accountId))
    .reduce((acc: number, l: any) => acc + (Number(l[field]) || 0), 0);
}

describe("postSalesInvoiceJournal (Issue #9 — Sales never posted revenue to the GL)", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_sales_invoice_posting");
    await Account.init();
    await Customer.init();
    await SalesInvoice.init();
    await JournalEntry.init();
    await ensureChartOfAccounts(tenantId, createdBy);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await (SalesInvoice as any).deleteMany({ tenantId });
    await JournalEntry.deleteMany({ tenantId });
    await Customer.deleteMany({ tenantId });
  });

  it("posts Dr Accounts Receivable / Cr Revenue for a plain (no-tax) invoice", async () => {
    const invoice = await makeInvoice();

    const journalId = await postSalesInvoiceJournal({
      invoice,
      tenantId,
      createdBy,
      current: { taxableAmount: 1000, totalTax: 0, tcsAmount: 0, tdsAmount: 0 },
    });
    await invoice.save();

    expect(journalId).toBeTruthy();
    const entry = await JournalEntry.findById(journalId).lean();
    expect(entry!.status).toBe("posted");
    expect(entry!.voucherType).toBe("sales");

    const ar = await Account.findOne({ tenantId, code: "1200" });
    const revenue = await Account.findOne({ tenantId, code: "4100" });
    expect(sumByAccount(entry!.lineIds, ar!._id, "debit")).toBe(1000);
    expect(sumByAccount(entry!.lineIds, revenue!._id, "credit")).toBe(1000);

    const reloaded = await (SalesInvoice as any).findById(invoice._id).lean();
    expect(reloaded!.postedSnapshot).toEqual({ taxableAmount: 1000, totalTax: 0, tcsAmount: 0, tdsAmount: 0 });
    expect(reloaded!.journalEntryIds).toHaveLength(1);
  });

  it("posts GST as its own liability line, AR still equal to the full total", async () => {
    const invoice = await makeInvoice({ totalAmount: 1180 });

    const journalId = await postSalesInvoiceJournal({
      invoice,
      tenantId,
      createdBy,
      current: { taxableAmount: 1000, totalTax: 180, tcsAmount: 0, tdsAmount: 0 },
    });
    const entry = await JournalEntry.findById(journalId).lean();

    const ar = await Account.findOne({ tenantId, code: "1200" });
    const revenue = await Account.findOne({ tenantId, code: "4100" });
    const gst = await Account.findOne({ tenantId, code: "2160" });

    expect(sumByAccount(entry!.lineIds, ar!._id, "debit")).toBe(1180);
    expect(sumByAccount(entry!.lineIds, revenue!._id, "credit")).toBe(1000);
    expect(sumByAccount(entry!.lineIds, gst!._id, "credit")).toBe(180);

    const totals = entry!.lineIds.reduce((acc: any, l: any) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit }), { debit: 0, credit: 0 });
    expect(totals.debit).toBeCloseTo(totals.credit);
  });

  it("posts TCS as a liability and TDS as a receivable, keeping AR equal to totalAmount", async () => {
    // taxableAmount 10000, tds 10% (=1000), tcs 0.1% (=10.01 ~10) -> totalAmount = 10000 - 1000 + 10 = 9010
    const invoice = await makeInvoice({ totalAmount: 9010 });

    const journalId = await postSalesInvoiceJournal({
      invoice,
      tenantId,
      createdBy,
      current: { taxableAmount: 10000, totalTax: 0, tcsAmount: 10, tdsAmount: 1000 },
    });
    const entry = await JournalEntry.findById(journalId).lean();

    const ar = await Account.findOne({ tenantId, code: "1200" });
    const revenue = await Account.findOne({ tenantId, code: "4100" });
    const tcs = await Account.findOne({ tenantId, code: "2170" });
    const tdsReceivable = await Account.findOne({ tenantId, code: "1210" });

    expect(sumByAccount(entry!.lineIds, ar!._id, "debit")).toBe(9010); // 10000 - 1000 + 10
    expect(sumByAccount(entry!.lineIds, revenue!._id, "credit")).toBe(10000);
    expect(sumByAccount(entry!.lineIds, tcs!._id, "credit")).toBe(10);
    expect(sumByAccount(entry!.lineIds, tdsReceivable!._id, "debit")).toBe(1000);

    const totals = entry!.lineIds.reduce((acc: any, l: any) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit }), { debit: 0, credit: 0 });
    expect(totals.debit).toBeCloseTo(totals.credit);
  });

  it("is idempotent: posting the same snapshot twice creates no second entry", async () => {
    const invoice = await makeInvoice();
    const snapshot = { taxableAmount: 1000, totalTax: 0, tcsAmount: 0, tdsAmount: 0 };

    const firstId = await postSalesInvoiceJournal({ invoice, tenantId, createdBy, current: snapshot });
    await invoice.save();
    expect(firstId).toBeTruthy();

    const secondId = await postSalesInvoiceJournal({ invoice, tenantId, createdBy, current: snapshot });
    expect(secondId).toBeNull();

    const count = await JournalEntry.countDocuments({ tenantId });
    expect(count).toBe(1);
  });

  it("edits (a value change) post a clean reclass delta, not a duplicate full entry", async () => {
    const invoice = await makeInvoice();
    await postSalesInvoiceJournal({ invoice, tenantId, createdBy, current: { taxableAmount: 1000, totalTax: 0, tcsAmount: 0, tdsAmount: 0 } });
    await invoice.save();

    // Invoice edited: line item price increased to 1500.
    const secondJournalId = await postSalesInvoiceJournal({
      invoice,
      tenantId,
      createdBy,
      current: { taxableAmount: 1500, totalTax: 0, tcsAmount: 0, tdsAmount: 0 },
    });
    await invoice.save();

    expect(secondJournalId).toBeTruthy();
    const entry = await JournalEntry.findById(secondJournalId).lean();
    const ar = await Account.findOne({ tenantId, code: "1200" });
    const revenue = await Account.findOne({ tenantId, code: "4100" });
    expect(sumByAccount(entry!.lineIds, ar!._id, "debit")).toBe(500); // delta only
    expect(sumByAccount(entry!.lineIds, revenue!._id, "credit")).toBe(500);

    const reloaded = await (SalesInvoice as any).findById(invoice._id).lean();
    expect(reloaded!.journalEntryIds).toHaveLength(2);
  });

  it("reverses cleanly (mirror-image entry) when the invoice is cancelled / moved back to draft", async () => {
    const invoice = await makeInvoice();
    await postSalesInvoiceJournal({ invoice, tenantId, createdBy, current: { taxableAmount: 1000, totalTax: 0, tcsAmount: 0, tdsAmount: 0 } });
    await invoice.save();

    const reversalId = await postSalesInvoiceJournal({
      invoice,
      tenantId,
      createdBy,
      current: { taxableAmount: 0, totalTax: 0, tcsAmount: 0, tdsAmount: 0 },
    });
    await invoice.save();

    expect(reversalId).toBeTruthy();
    const entry = await JournalEntry.findById(reversalId).lean();
    const ar = await Account.findOne({ tenantId, code: "1200" });
    const revenue = await Account.findOne({ tenantId, code: "4100" });
    expect(sumByAccount(entry!.lineIds, ar!._id, "credit")).toBe(1000);
    expect(sumByAccount(entry!.lineIds, revenue!._id, "debit")).toBe(1000);
  });
});

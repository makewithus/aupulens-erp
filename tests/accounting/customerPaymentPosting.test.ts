import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import Account from "@/models/Account";
import Customer from "@/models/Customer";
import Payment from "@/models/Payment";
import JournalEntry from "@/models/JournalEntry";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { postCustomerPaymentJournal } from "@/lib/accounting/payments";

const tenantId = "t-customer-payment-posting";
const createdBy = new mongoose.Types.ObjectId().toString();

async function makeCustomer() {
  return Customer.create({
    tenantId,
    header: { name: "Test Customer", is_company: true },
    createdBy: new mongoose.Types.ObjectId(createdBy),
  });
}

async function makePayment(overrides: Partial<Record<string, any>> = {}) {
  const bankAccount = await Account.findOne({ tenantId, code: "1120" });
  const customer = overrides.customerId ? null : await makeCustomer();
  return Payment.create({
    tenantId,
    customerId: overrides.customerId || customer!._id,
    paymentNumber: overrides.paymentNumber || `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    paymentDate: new Date("2026-07-10"),
    amountReceived: overrides.amountReceived ?? 1000,
    bankCharges: overrides.bankCharges ?? 0,
    tdsAmount: overrides.tdsAmount ?? 0,
    depositToAccountId: overrides.depositToAccountId ?? bankAccount!._id,
    allocations: overrides.allocations ?? [],
    unusedAmount: overrides.unusedAmount ?? 0,
    status: "paid",
    ...overrides,
  });
}

function sumByAccount(lines: any[], accountId: mongoose.Types.ObjectId, field: "debit" | "credit") {
  return lines
    .filter((l: any) => String(l.accountId) === String(accountId))
    .reduce((acc: number, l: any) => acc + (Number(l[field]) || 0), 0);
}

describe("postCustomerPaymentJournal", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_customer_payment_posting");
    await Account.init();
    await Customer.init();
    await Payment.init();
    await JournalEntry.init();
    await ensureChartOfAccounts(tenantId, createdBy);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Payment.deleteMany({ tenantId });
    await JournalEntry.deleteMany({ tenantId });
    await Customer.deleteMany({ tenantId });
  });

  it("posts a standard receipt: Dr Bank / Cr AR for the allocated total", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const payment = await makePayment({ allocations: [{ invoiceId, amount: 1000 }], unusedAmount: 0 });

    const journalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 1000, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 },
    });
    await payment.save();

    expect(journalId).toBeTruthy();
    const entry = await JournalEntry.findById(journalId).lean();
    expect(entry).toBeTruthy();
    const bankAccount = await Account.findOne({ tenantId, code: "1120" });
    const arAccount = await Account.findOne({ tenantId, code: "1200" });
    expect(sumByAccount(entry!.lineIds, bankAccount!._id, "debit")).toBe(1000);
    expect(sumByAccount(entry!.lineIds, arAccount!._id, "credit")).toBe(1000);
    expect(entry!.status).toBe("posted");

    const reloaded = await Payment.findById(payment._id).lean();
    expect(reloaded!.postedSnapshot).toEqual({ allocatedTotal: 1000, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 });
    expect(reloaded!.journalEntryIds).toHaveLength(1);
  });

  it("posts bank charges as their own expense line, reducing the bank debit", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const payment = await makePayment({
      allocations: [{ invoiceId, amount: 980 }],
      bankCharges: 20,
      amountReceived: 1000,
    });

    const journalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 980, unusedAmount: 0, bankCharges: 20, tdsAmount: 0 },
    });
    const entry = await JournalEntry.findById(journalId).lean();

    const bankAccount = await Account.findOne({ tenantId, code: "1120" });
    const arAccount = await Account.findOne({ tenantId, code: "1200" });
    const chargesAccount = await Account.findOne({ tenantId, code: "5150" });

    expect(sumByAccount(entry!.lineIds, bankAccount!._id, "debit")).toBe(960); // 980 - 20
    expect(sumByAccount(entry!.lineIds, chargesAccount!._id, "debit")).toBe(20);
    expect(sumByAccount(entry!.lineIds, arAccount!._id, "credit")).toBe(980);

    const totals = entry!.lineIds.reduce(
      (acc: any, l: any) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit }),
      { debit: 0, credit: 0 },
    );
    expect(totals.debit).toBeCloseTo(totals.credit);
  });

  it("posts TDS as a receivable, crediting AR for the full settled amount", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const payment = await makePayment({
      allocations: [{ invoiceId, amount: 1000 }],
      tdsAmount: 100,
      amountReceived: 1100,
    });

    const journalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 1000, unusedAmount: 0, bankCharges: 0, tdsAmount: 100 },
    });
    const entry = await JournalEntry.findById(journalId).lean();

    const bankAccount = await Account.findOne({ tenantId, code: "1120" });
    const arAccount = await Account.findOne({ tenantId, code: "1200" });
    const tdsAccount = await Account.findOne({ tenantId, code: "1210" });

    expect(sumByAccount(entry!.lineIds, bankAccount!._id, "debit")).toBe(900); // 1000 - 100 tds
    expect(sumByAccount(entry!.lineIds, tdsAccount!._id, "debit")).toBe(100);
    expect(sumByAccount(entry!.lineIds, arAccount!._id, "credit")).toBe(1000); // full invoice settlement
  });

  it("posts unallocated excess to Customer Advances, not AR", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const payment = await makePayment({
      allocations: [{ invoiceId, amount: 700 }],
      unusedAmount: 300,
      amountReceived: 1000,
    });

    const journalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 700, unusedAmount: 300, bankCharges: 0, tdsAmount: 0 },
    });
    const entry = await JournalEntry.findById(journalId).lean();

    const bankAccount = await Account.findOne({ tenantId, code: "1120" });
    const arAccount = await Account.findOne({ tenantId, code: "1200" });
    const advancesAccount = await Account.findOne({ tenantId, code: "2150" });

    expect(sumByAccount(entry!.lineIds, bankAccount!._id, "debit")).toBe(1000);
    expect(sumByAccount(entry!.lineIds, arAccount!._id, "credit")).toBe(700);
    expect(sumByAccount(entry!.lineIds, advancesAccount!._id, "credit")).toBe(300);
  });

  it("posts a retainer (no invoice) as pure Dr Bank / Cr Customer Advances", async () => {
    const payment = await makePayment({ allocations: [], unusedAmount: 500, amountReceived: 500 });

    const journalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 0, unusedAmount: 500, bankCharges: 0, tdsAmount: 0 },
    });
    const entry = await JournalEntry.findById(journalId).lean();
    expect(entry!.lineIds).toHaveLength(2);

    const bankAccount = await Account.findOne({ tenantId, code: "1120" });
    const advancesAccount = await Account.findOne({ tenantId, code: "2150" });
    expect(sumByAccount(entry!.lineIds, bankAccount!._id, "debit")).toBe(500);
    expect(sumByAccount(entry!.lineIds, advancesAccount!._id, "credit")).toBe(500);
  });

  it("applying excess to a new invoice later posts a clean two-line reclass with no bank line", async () => {
    const invoiceId1 = new mongoose.Types.ObjectId();
    const payment = await makePayment({
      allocations: [{ invoiceId: invoiceId1, amount: 700 }],
      unusedAmount: 300,
      amountReceived: 1000,
    });
    await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 700, unusedAmount: 300, bankCharges: 0, tdsAmount: 0 },
    });
    await payment.save();

    // Later: apply the 300 excess to a second invoice — amountReceived/charges/tds unchanged.
    const invoiceId2 = new mongoose.Types.ObjectId();
    payment.allocations.push({ invoiceId: invoiceId2, amount: 300 } as any);
    payment.unusedAmount = 0;
    const reclassJournalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 1000, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 },
    });

    expect(reclassJournalId).toBeTruthy();
    const entry = await JournalEntry.findById(reclassJournalId).lean();
    expect(entry!.lineIds).toHaveLength(2); // no bank line at all

    const bankAccount = await Account.findOne({ tenantId, code: "1120" });
    const arAccount = await Account.findOne({ tenantId, code: "1200" });
    const advancesAccount = await Account.findOne({ tenantId, code: "2150" });

    expect(sumByAccount(entry!.lineIds, bankAccount!._id, "debit")).toBe(0);
    expect(sumByAccount(entry!.lineIds, bankAccount!._id, "credit")).toBe(0);
    expect(sumByAccount(entry!.lineIds, advancesAccount!._id, "debit")).toBe(300);
    expect(sumByAccount(entry!.lineIds, arAccount!._id, "credit")).toBe(300);
  });

  it("void posts a mirror-image reversal without touching the original entry", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const payment = await makePayment({ allocations: [{ invoiceId, amount: 1000 }], unusedAmount: 0 });
    const originalJournalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 1000, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 },
    });
    await payment.save();
    const originalEntryBefore = await JournalEntry.findById(originalJournalId).lean();

    const reversalJournalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 0, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 },
    });
    await payment.save();

    expect(reversalJournalId).toBeTruthy();
    expect(String(reversalJournalId)).not.toBe(String(originalJournalId));

    const originalEntryAfter = await JournalEntry.findById(originalJournalId).lean();
    expect(originalEntryAfter!.lineIds).toEqual(originalEntryBefore!.lineIds); // untouched

    const reversalEntry = await JournalEntry.findById(reversalJournalId).lean();
    const bankAccount = await Account.findOne({ tenantId, code: "1120" });
    const arAccount = await Account.findOne({ tenantId, code: "1200" });
    expect(sumByAccount(reversalEntry!.lineIds, bankAccount!._id, "credit")).toBe(1000);
    expect(sumByAccount(reversalEntry!.lineIds, arAccount!._id, "debit")).toBe(1000);

    const reloaded = await Payment.findById(payment._id).lean();
    expect(reloaded!.journalEntryIds).toHaveLength(2);
    expect(reloaded!.postedSnapshot).toEqual({ allocatedTotal: 0, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 });
  });

  it("is idempotent: posting the same current snapshot twice creates no second entry", async () => {
    const invoiceId = new mongoose.Types.ObjectId();
    const payment = await makePayment({ allocations: [{ invoiceId, amount: 500 }], unusedAmount: 0 });
    const snapshot = { allocatedTotal: 500, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 };

    const firstId = await postCustomerPaymentJournal({ payment, tenantId, createdBy, current: snapshot });
    await payment.save();
    expect(firstId).toBeTruthy();

    const secondId = await postCustomerPaymentJournal({ payment, tenantId, createdBy, current: snapshot });
    expect(secondId).toBeNull();

    const reloaded = await Payment.findById(payment._id).lean();
    expect(reloaded!.journalEntryIds).toHaveLength(1);
  });

  it("a draft payment (current = all-zero, nothing previously posted) posts nothing", async () => {
    const payment = await makePayment({ allocations: [], unusedAmount: 0, status: "draft" });
    const journalId = await postCustomerPaymentJournal({
      payment,
      tenantId,
      createdBy,
      current: { allocatedTotal: 0, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 },
    });
    expect(journalId).toBeNull();
    const count = await JournalEntry.countDocuments({ tenantId });
    expect(count).toBe(0);
  });

  it("fails with a clear, actionable error when the selected Deposit To account no longer exists", async () => {
    // ensureChartOfAccounts auto-heals the fixed default accounts (AR, Bank
    // Charges, TDS Receivable, Customer Advances) on every call, so the only
    // realistic way a required account is "missing" at posting time is a
    // per-payment reference — like depositToAccountId — pointing at an
    // account that was since deleted. Simulate that directly.
    const invoiceId = new mongoose.Types.ObjectId();
    const deletedAccountId = new mongoose.Types.ObjectId();
    const payment = await makePayment({
      allocations: [{ invoiceId, amount: 500 }],
      unusedAmount: 0,
      depositToAccountId: deletedAccountId,
    });

    await expect(
      postCustomerPaymentJournal({
        payment,
        tenantId,
        createdBy,
        current: { allocatedTotal: 500, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 },
      }),
    ).rejects.toThrow(/Deposit To account was not found/i);

    const count = await JournalEntry.countDocuments({ tenantId, "header.ref": payment.paymentNumber });
    expect(count).toBe(0); // nothing partially posted
  });
});

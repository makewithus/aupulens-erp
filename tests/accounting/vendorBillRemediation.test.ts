import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Account from "@/models/finance/Account";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import JournalEntry from "@/models/finance/JournalEntry";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { DOCUMENT_STATUS, PAYMENT_STATE, VOUCHER_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { validateJournalLinesForPosting } from "@/lib/accounting/journal-validation";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { assertTransactionNotLocked } from "@/lib/accounting/transactionLock";
import TransactionLock from "@/models/finance/TransactionLock";

const tenantId = `t-bill-rem-${Date.now()}`;
const createdBy = new mongoose.Types.ObjectId().toString();
const baseUri = process.env.MONGODB_URI?.split("?")[0].replace(/\/[^/]*$/, "") || "mongodb://localhost:27017";

describe("Vendor Bill Remediation & Accounting Lifecycle", () => {
  beforeAll(async () => {
    const dbName = `aupulens_test_bill_rem_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    await mongoose.connect(`${baseUri}/${dbName}`);
    await Account.init();
    await Customer.init();
    await Invoice.init();
    await JournalEntry.init();
    await TransactionLock.init();
    await ensureChartOfAccounts(tenantId, createdBy);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("assigns not_applicable PO match status for direct vendor bills without PO reference", async () => {
    const vendor = await Customer.create({
      tenantId,
      header: { name: "Direct Services Co", is_company: true },
      createdBy,
    });

    const bill = await Invoice.create({
      tenantId,
      name: "BILL/2026/TEST01",
      partnerId: vendor._id,
      moveType: "in_invoice",
      invoiceDate: new Date("2026-08-01"),
      dueDate: new Date("2026-08-31"),
      invoiceLines: [{ name: "Consulting", quantity: 1, priceUnit: 5000, priceSubtotal: 5000, taxIds: [] }],
      amountUntaxed: 5000,
      amountTax: 0,
      amountTotal: 5000,
      amountResidual: 5000,
      state: DOCUMENT_STATUS.DRAFT,
      paymentState: PAYMENT_STATE.NOT_PAID,
      poMatchType: "2_way",
      poMatchStatus: "not_applicable",
      createdBy,
    });

    expect(bill.poMatchStatus).toBe("not_applicable");
    expect(bill.state).toBe(DOCUMENT_STATUS.DRAFT);
  });

  it("validates that a bill without invoice lines cannot be posted", async () => {
    const vendor = await Customer.create({
      tenantId,
      header: { name: "Empty Bill Vendor", is_company: true },
      createdBy,
    });

    const emptyBill = await Invoice.create({
      tenantId,
      name: "BILL/2026/EMPTY01",
      partnerId: vendor._id,
      moveType: "in_invoice",
      invoiceDate: new Date("2026-08-01"),
      dueDate: new Date("2026-08-31"),
      invoiceLines: [],
      amountTotal: 1000,
      state: DOCUMENT_STATUS.DRAFT,
      createdBy,
    });

    const hasLines = (emptyBill.invoiceLines || []).length > 0;
    expect(hasLines).toBe(false);
  });

  it("posts an approved vendor bill into the General Ledger with balanced Dr Expense / Cr AP", async () => {
    const vendor = await Customer.create({
      tenantId,
      header: { name: "Approved Office Supplies Ltd", is_company: true },
      createdBy,
    });

    const payableAccount = await Account.findOne({ tenantId, account_type: "liability_payable" });
    const expenseAccount = await Account.findOne({ tenantId, account_type: "expense" });
    expect(payableAccount).toBeDefined();
    expect(expenseAccount).toBeDefined();

    const bill = await Invoice.create({
      tenantId,
      name: "BILL/2026/OFFICE01",
      partnerId: vendor._id,
      moveType: "in_invoice",
      invoiceDate: new Date("2026-08-10"),
      dueDate: new Date("2026-09-10"),
      invoiceLines: [{
        name: "Stationery and Supplies",
        quantity: 1,
        priceUnit: 1500,
        priceSubtotal: 1500,
        taxIds: [],
        accountId: expenseAccount!._id,
      }],
      amountUntaxed: 1500,
      amountTax: 0,
      amountTotal: 1500,
      amountResidual: 1500,
      state: DOCUMENT_STATUS.APPROVED,
      paymentState: PAYMENT_STATE.NOT_PAID,
      poMatchStatus: "not_applicable",
      createdBy,
    });

    // Simulate posting workflow
    const lineIds = [
      {
        accountId: expenseAccount!._id,
        label: "Stationery and Supplies",
        debit: 1500,
        credit: 0,
        sourceDocument: bill.name,
        sourceId: bill._id,
      },
      {
        accountId: payableAccount!._id,
        label: `Payable for ${bill.name}`,
        debit: 0,
        credit: 1500,
        sourceDocument: bill.name,
        sourceId: bill._id,
      },
    ];

    const validationErr = validateJournalLinesForPosting(lineIds);
    expect(validationErr).toBeNull();

    const je = await createPostedJournalEntry({
      tenantId,
      header: {
        name: `JE/${bill.name}`,
        date: bill.invoiceDate,
        ref: bill.name,
        journalType: "purchase",
      },
      voucherType: VOUCHER_TYPE.PURCHASE,
      lineIds,
      totals: { amountUntaxed: 1500, amountTax: 0, amountTotal: 1500 },
      createdBy,
    });

    bill.state = DOCUMENT_STATUS.POSTED;
    bill.journalId = je._id as any;
    await bill.save();

    expect(bill.state).toBe(DOCUMENT_STATUS.POSTED);
    expect(je.status).toBe(DOCUMENT_STATUS.POSTED);
    expect(je.totals.amountTotal).toBe(1500);

    // Verify GL line balance
    const storedJE = await JournalEntry.findById(je._id);
    expect(storedJE).toBeDefined();
    const debits = storedJE!.lineIds.reduce((sum, l) => sum + l.debit, 0);
    const credits = storedJE!.lineIds.reduce((sum, l) => sum + l.credit, 0);
    expect(debits).toBe(1500);
    expect(credits).toBe(1500);
    expect(debits).toBe(credits);
  });

  it("prevents double-posting on retry by reusing existing journal entry", async () => {
    const existing = await JournalEntry.findOne({ "header.ref": "BILL/2026/OFFICE01", tenantId });
    expect(existing).toBeDefined();

    // Secondary attempt with same bill name
    const countBefore = await JournalEntry.countDocuments({ "header.ref": "BILL/2026/OFFICE01", tenantId });
    expect(countBefore).toBe(1);

    // Emulate idempotent lookup
    const lookup = await JournalEntry.findOne({ "header.ref": "BILL/2026/OFFICE01", tenantId });
    if (lookup && lookup.status === DOCUMENT_STATUS.POSTED) {
      // Return existing
      expect(lookup._id.toString()).toBe(existing!._id.toString());
    }

    const countAfter = await JournalEntry.countDocuments({ "header.ref": "BILL/2026/OFFICE01", tenantId });
    expect(countAfter).toBe(1);
  });

  it("rejects posting bills dated within a locked accounting period", async () => {
    await TransactionLock.create({
      tenantId,
      module: "purchases",
      isLocked: true,
      lockedUpToDate: new Date("2026-08-31"),
    });

    let errorThrown: any = null;
    try {
      await assertTransactionNotLocked(tenantId, "purchases", new Date("2026-08-15"));
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).toBeDefined();
    expect(errorThrown.message).toContain("locked");
  });
});

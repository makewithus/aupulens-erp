import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { DOCUMENT_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { buildPostedJournalReport } from "@/lib/accounting/reports";

const tenantId = `t-pl-multistep-${Date.now()}`;
const createdBy = new mongoose.Types.ObjectId().toString();
const baseUri = process.env.MONGODB_URI?.split("?")[0].replace(/\/[^/]*$/, "") || "mongodb://localhost:27017";

describe("Profit & Loss Multi-Step Reporting & Financial Integrity", () => {
  beforeAll(async () => {
    const dbName = `aupulens_test_pl_multi_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    await mongoose.connect(`${baseUri}/${dbName}`);
    await Account.init();
    await JournalEntry.init();
    await ensureChartOfAccounts(tenantId, createdBy);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("calculates multi-step Gross Profit, Operating Income, and Net Income from child accounts", async () => {
    const revenueAccount = await Account.findOne({ tenantId, account_type: "income" });
    const cogsAccount = (await Account.findOne({ tenantId, code: "5100" })) || (await Account.create({
      tenantId,
      code: "5100",
      name: "Cost of Goods Sold",
      account_type: "expense_direct_cost",
      internal_group: "expense",
      reconcile: false,
      createdBy,
    }));
    const opexAccount = await Account.findOne({ tenantId, account_type: "expense" });
    const cashAccount = await Account.findOne({ tenantId, account_type: "asset_cash" });
    const arAccount = await Account.findOne({ tenantId, account_type: "asset_receivable" });
    const apAccount = await Account.findOne({ tenantId, account_type: "liability_payable" });

    // 1. Post Revenue: Dr AR 100,000 / Cr Revenue 100,000
    await createPostedJournalEntry({
      tenantId,
      header: { name: "INV/001", date: new Date("2026-08-01"), ref: "SO-1", journalType: "sale" },
      voucherType: VOUCHER_TYPE.SALES,
      lineIds: [
        { accountId: arAccount!._id, debit: 100000, credit: 0, label: "Customer Invoice" },
        { accountId: revenueAccount!._id, debit: 0, credit: 100000, label: "Services Revenue" },
      ],
      totals: { amountUntaxed: 100000, amountTax: 0, amountTotal: 100000 },
      createdBy,
    });

    // 2. Post COGS: Dr COGS 30,000 / Cr AP 30,000
    await createPostedJournalEntry({
      tenantId,
      header: { name: "BILL/001", date: new Date("2026-08-05"), ref: "PO-1", journalType: "purchase" },
      voucherType: VOUCHER_TYPE.PURCHASE,
      lineIds: [
        { accountId: cogsAccount._id, debit: 30000, credit: 0, label: "Direct Supplies" },
        { accountId: apAccount!._id, debit: 0, credit: 30000, label: "Vendor Payable" },
      ],
      totals: { amountUntaxed: 30000, amountTax: 0, amountTotal: 30000 },
      createdBy,
    });

    // 3. Post OPEX: Dr Operating Expense 20,000 / Cr Cash 20,000
    await createPostedJournalEntry({
      tenantId,
      header: { name: "EXP/001", date: new Date("2026-08-10"), ref: "RENT-1", journalType: "bank" },
      voucherType: VOUCHER_TYPE.PAYMENT,
      lineIds: [
        { accountId: opexAccount!._id, debit: 20000, credit: 0, label: "Office Rent" },
        { accountId: cashAccount!._id, debit: 0, credit: 20000, label: "Bank Payment" },
      ],
      totals: { amountUntaxed: 20000, amountTax: 0, amountTotal: 20000 },
      createdBy,
    });

    const report = await buildPostedJournalReport({ tenantId });
    expect(report.totals.balanced).toBe(true);

    const summary = report.statementSummary;
    expect(summary).toBeDefined();
    expect(summary!.revenue).toBe(100000);
    expect(summary!.cogs).toBe(30000);
    expect(summary!.grossProfit).toBe(70000);
    expect(summary!.grossMarginPercent).toBe(70);
    expect(summary!.operatingExpenses).toBe(20000);
    expect(summary!.operatingIncome).toBe(50000);
    expect(summary!.netIncome).toBe(50000);

    // Reconcile: report.income.total - report.expense.total === netIncome
    const flatNet = report.income.total - report.expense.total;
    expect(flatNet).toBe(summary!.netIncome);
  });

  it("handles debit postings to income accounts correctly as revenue reductions", async () => {
    const revenueAccount = await Account.findOne({ tenantId, account_type: "income" });
    const cashAccount = await Account.findOne({ tenantId, account_type: "asset_cash" });

    // Customer discount or refund: Dr Revenue 5,000 / Cr Cash 5,000
    await createPostedJournalEntry({
      tenantId,
      header: { name: "CRN/001", date: new Date("2026-08-15"), ref: "DISC-1", journalType: "general" },
      voucherType: VOUCHER_TYPE.JOURNAL,
      lineIds: [
        { accountId: revenueAccount!._id, debit: 5000, credit: 0, label: "Sales Discount Allowed" },
        { accountId: cashAccount!._id, debit: 0, credit: 5000, label: "Refund" },
      ],
      totals: { amountUntaxed: 5000, amountTax: 0, amountTotal: 5000 },
      createdBy,
    });

    const report = await buildPostedJournalReport({ tenantId });
    expect(report.totals.balanced).toBe(true);

    const summary = report.statementSummary;
    // Revenue was 100,000 - 5,000 discount = 95,000
    expect(summary!.revenue).toBe(95000);
    // Gross Profit: 95,000 - 30,000 = 65,000
    expect(summary!.grossProfit).toBe(65000);
    // Net Income: 65,000 - 20,000 = 45,000
    expect(summary!.netIncome).toBe(45000);
  });

  it("excludes unposted and draft entries from posted financial reports", async () => {
    const revenueAccount = await Account.findOne({ tenantId, account_type: "income" });
    const cashAccount = await Account.findOne({ tenantId, account_type: "asset_cash" });

    // Create an unposted draft journal entry
    await JournalEntry.create({
      tenantId,
      header: { name: "DRAFT/001", date: new Date("2026-08-20"), ref: "DRAFT-SO", journalType: "sale" },
      voucherType: VOUCHER_TYPE.SALES,
      status: DOCUMENT_STATUS.DRAFT,
      lineIds: [
        { accountId: cashAccount!._id, debit: 500000, credit: 0, label: "Unposted Big Sale" },
        { accountId: revenueAccount!._id, debit: 0, credit: 500000, label: "Unposted Revenue" },
      ],
      totals: { amountUntaxed: 500000, amountTax: 0, amountTotal: 500000 },
      createdBy,
    });

    const report = await buildPostedJournalReport({ tenantId });
    // Unposted 500,000 should NOT be included in revenue
    expect(report.statementSummary!.revenue).toBe(95000);
  });
});

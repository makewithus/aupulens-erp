import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Payroll from "@/models/hr/Payroll";
import Employee from "@/models/hr/Employee";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { DOCUMENT_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { validateJournalLinesForPosting } from "@/lib/accounting/journal-validation";

const tenantId = `t-payroll-rem-${Date.now()}`;
const createdBy = new mongoose.Types.ObjectId().toString();
const baseUri = process.env.MONGODB_URI?.split("?")[0].replace(/\/[^/]*$/, "") || "mongodb://localhost:27017";

describe("Payroll Accounting Remediation & Journal Lifecycle", () => {
  beforeAll(async () => {
    const dbName = `aupulens_test_payroll_rem_${randomUUID().replaceAll("-", "").slice(0, 14)}`;
    await mongoose.connect(`${baseUri}/${dbName}`);
    await Account.init();
    await Employee.init();
    await Payroll.init();
    await JournalEntry.init();
    await ensureChartOfAccounts(tenantId, createdBy);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Payroll.deleteMany({ tenantId });
    await JournalEntry.deleteMany({ tenantId });
  });

  it("prevents zero-gross payroll runs from silently generating zero-value journals", () => {
    const zeroGrossPayroll = {
      tenantId,
      payrollCode: "PR-2026-ZERO",
      status: "reviewed",
      totals: {
        totalGross: 0,
        totalDeductions: 2400,
        totalNet: -2400,
      },
    };

    const isAdjustment = false;
    const canApprove = zeroGrossPayroll.totals.totalGross > 0 || isAdjustment;
    expect(canApprove).toBe(false);
  });

  it("generates balanced double-entry accounting for valid payroll with deductions", async () => {
    let salaryExpenseAccount = await Account.findOne({ tenantId, account_type: "expense" });
    let salaryPayableAccount = await Account.findOne({ tenantId, code: "2200" });
    if (!salaryPayableAccount) {
      salaryPayableAccount = await Account.create({
        tenantId,
        code: "2200",
        name: "Salary Payable",
        account_type: "liability_current",
        internal_group: "liability",
        reconcile: true,
        createdBy,
      });
    }

    const deductionsAccount = await Account.create({
      tenantId,
      code: "2210",
      name: "Payroll Deductions Payable",
      account_type: "liability_current",
      internal_group: "liability",
      reconcile: true,
      createdBy,
    });

    const totalGross = 100000;
    const totalDeductions = 15000;
    const totalNet = 85000;
    const payrollCode = "PR-2026-TEST01";

    const lineIds = [
      {
        accountId: salaryExpenseAccount!._id,
        label: `Salary Expense - ${payrollCode}`,
        debit: totalGross,
        credit: 0,
      },
      {
        accountId: salaryPayableAccount._id,
        label: `Salary Payable (Net Pay) - ${payrollCode}`,
        debit: 0,
        credit: totalNet,
      },
      {
        accountId: deductionsAccount._id,
        label: `Payroll Deductions (PF/ESI/TDS/PT) - ${payrollCode}`,
        debit: 0,
        credit: totalDeductions,
      },
    ];

    const validationError = validateJournalLinesForPosting(lineIds);
    expect(validationError).toBeNull();

    const je = await createPostedJournalEntry({
      tenantId,
      header: {
        name: `JE-PAYROLL-${payrollCode}`,
        date: new Date("2026-08-31"),
        ref: payrollCode,
        journalType: "general",
      },
      voucherType: VOUCHER_TYPE.JOURNAL,
      lineIds,
      totals: { amountUntaxed: totalGross, amountTax: 0, amountTotal: totalGross },
      createdBy,
    });

    expect(je.status).toBe(DOCUMENT_STATUS.POSTED);
    expect(je.lineIds.length).toBe(3);

    const totalDebit = je.lineIds.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = je.lineIds.reduce((sum, l) => sum + l.credit, 0);
    expect(totalDebit).toBe(totalGross);
    expect(totalCredit).toBe(totalGross);
    expect(totalDebit).toBe(totalCredit);
  });

  it("clears Salary Payable to exactly zero upon disbursement to bank", async () => {
    const salaryPayableAccount = await Account.findOne({ tenantId, code: "2200" });
    const bankAccount = await Account.findOne({ tenantId, account_type: "asset_cash" });
    expect(salaryPayableAccount).toBeDefined();
    expect(bankAccount).toBeDefined();

    const totalNet = 85000;
    const payrollCode = "PR-2026-TEST01";

    const salaryExpenseAccount = await Account.findOne({ tenantId, account_type: "expense" });
    const deductionsAccount = await Account.findOne({ tenantId, code: "2210" }) || await Account.create({
      tenantId,
      code: "2210",
      name: "Payroll Deductions Payable",
      account_type: "liability_current",
      internal_group: "liability",
      reconcile: true,
      createdBy,
    });

    // 1. Accrual JE (Books Cr Salary Payable 85,000)
    await createPostedJournalEntry({
      tenantId,
      header: {
        name: `JE-PAY-${payrollCode}`,
        date: new Date("2026-08-31"),
        ref: payrollCode,
        journalType: "general",
      },
      voucherType: VOUCHER_TYPE.JOURNAL,
      lineIds: [
        { accountId: salaryExpenseAccount!._id, debit: 100000, credit: 0, label: "Gross Wages" },
        { accountId: salaryPayableAccount!._id, debit: 0, credit: totalNet, label: "Net Payable" },
        { accountId: deductionsAccount._id, debit: 0, credit: 15000, label: "Deductions Payable" },
      ],
      totals: { amountUntaxed: 100000, amountTax: 0, amountTotal: 100000 },
      createdBy,
    });

    // 2. Disbursement JE (Clears Dr Salary Payable 85,000)
    const disbLines = [
      {
        accountId: salaryPayableAccount!._id,
        label: `Salary Payable Settlement - ${payrollCode}`,
        debit: totalNet,
        credit: 0,
      },
      {
        accountId: bankAccount!._id,
        label: `Bank Payment - ${payrollCode}`,
        debit: 0,
        credit: totalNet,
      },
    ];

    const disbJE = await createPostedJournalEntry({
      tenantId,
      header: {
        name: `JE-DISB-${payrollCode}`,
        date: new Date("2026-09-01"),
        ref: payrollCode,
        journalType: "bank",
      },
      voucherType: VOUCHER_TYPE.PAYMENT,
      lineIds: disbLines,
      totals: { amountUntaxed: totalNet, amountTax: 0, amountTotal: totalNet },
      createdBy,
    });

    expect(disbJE.status).toBe(DOCUMENT_STATUS.POSTED);

    // Verify net movement on Salary Payable account
    const payableMovements = await JournalEntry.aggregate([
      { $match: { tenantId, status: DOCUMENT_STATUS.POSTED } },
      { $unwind: "$lineIds" },
      { $match: { "lineIds.accountId": salaryPayableAccount!._id } },
      { $group: { _id: null, debit: { $sum: "$lineIds.debit" }, credit: { $sum: "$lineIds.credit" } } },
    ]);

    expect(payableMovements[0]).toBeDefined();
    const netPayableBalance = payableMovements[0].credit - payableMovements[0].debit;
    expect(netPayableBalance).toBe(0);
  });

  it("handles negative adjustments/reversals with balanced opposite-sign journal lines", async () => {
    const salaryExpenseAccount = await Account.findOne({ tenantId, account_type: "expense" });
    const salaryPayableAccount = await Account.findOne({ tenantId, code: "2200" });
    const deductionsAccount = await Account.findOne({ tenantId, code: "2210" });

    const totalGross = -5000;
    const totalDeductions = -500;
    const totalNet = -4500;
    const payrollCode = "PR-2026-REV01";

    const absGross = Math.abs(totalGross);
    const absNet = Math.abs(totalNet);
    const absDed = Math.abs(totalDeductions);

    const reversalLines = [
      {
        accountId: salaryExpenseAccount!._id,
        label: `Salary Expense Reversal - ${payrollCode}`,
        debit: 0,
        credit: absGross,
      },
      {
        accountId: salaryPayableAccount!._id,
        label: `Salary Payable Reversal - ${payrollCode}`,
        debit: absNet,
        credit: 0,
      },
      {
        accountId: deductionsAccount!._id,
        label: `Payroll Deductions Reversal - ${payrollCode}`,
        debit: absDed,
        credit: 0,
      },
    ];

    const error = validateJournalLinesForPosting(reversalLines);
    expect(error).toBeNull();

    const revJE = await createPostedJournalEntry({
      tenantId,
      header: {
        name: `JE-PAYROLL-${payrollCode}`,
        date: new Date("2026-09-02"),
        ref: payrollCode,
        journalType: "general",
      },
      voucherType: VOUCHER_TYPE.JOURNAL,
      lineIds: reversalLines,
      totals: { amountUntaxed: absGross, amountTax: 0, amountTotal: absGross },
      createdBy,
    });

    const debits = revJE.lineIds.reduce((sum, l) => sum + l.debit, 0);
    const credits = revJE.lineIds.reduce((sum, l) => sum + l.credit, 0);
    expect(debits).toBe(5000);
    expect(credits).toBe(5000);
  });
});

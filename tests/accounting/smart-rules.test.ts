import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_smart_rules";

import Account from "@/models/Account";
import AccountType from "@/models/AccountType";
import { applySemanticRulesAndClassify } from "@/lib/accounting/smart-rules";

const TENANT = "smart-rules-t1";

async function makeLegacyAccount(name: string, account_type: string) {
  const doc = await Account.create({
    tenantId: TENANT,
    code: `L-${name}-${Date.now()}-${Math.random()}`,
    name,
    account_type,
    createdBy: new mongoose.Types.ObjectId(),
  });
  return doc._id.toString();
}

async function makeModernAccount(name: string, typeName: string, segment: string) {
  const type = await AccountType.create({
    tenantId: TENANT,
    name: `${typeName}-${Math.random()}`,
    segment,
    createdBy: new mongoose.Types.ObjectId(),
  });
  const doc = await Account.create({
    tenantId: TENANT,
    accountName: name,
    accountType: type._id,
    createdBy: new mongoose.Types.ObjectId(),
  });
  return doc._id.toString();
}

describe("applySemanticRulesAndClassify (Issue #2)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Account.init();
    await AccountType.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Account.deleteMany({});
    await AccountType.deleteMany({});
  });

  it("blocks Expense debited directly against Equity/Capital with no Cash/Bank/Liability offset", async () => {
    const salary = await makeLegacyAccount("Salary Expense", "expense");
    const capital = await makeLegacyAccount("Owner Capital", "equity");

    const result = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: salary, debit: 1000, credit: 0 }, { accountId: capital, debit: 0, credit: 1000 }] },
      TENANT,
    );

    expect(result.ok).toBe(false);
    expect((result as any).error).toMatch(/expense must be offset/i);
  });

  it("blocks Income credited directly against a Liability with no Cash/Bank/Asset offset", async () => {
    const income = await makeLegacyAccount("Consulting Income", "income");
    const liability = await makeLegacyAccount("Unearned Revenue", "liability_current");

    const result = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: liability, debit: 1000, credit: 0 }, { accountId: income, debit: 0, credit: 1000 }] },
      TENANT,
    );

    expect(result.ok).toBe(false);
    expect((result as any).error).toMatch(/income must be offset/i);
  });

  it("allows a standard Expense Dr / Cash Cr pairing and classifies it as a Payment Voucher", async () => {
    const expense = await makeLegacyAccount("Office Supplies", "expense");
    const cash = await makeLegacyAccount("Main Cash", "asset_cash");

    const result = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: expense, debit: 500, credit: 0 }, { accountId: cash, debit: 0, credit: 500 }] },
      TENANT,
    );

    expect(result.ok).toBe(true);
    expect((result as any).body.voucherType).toBe("payment");
    expect((result as any).body.header.journalType).toBe("cash");
  });

  it("allows a standard Income Cr / Cash Dr pairing and classifies it as a Receipt Voucher", async () => {
    const income = await makeLegacyAccount("Service Income", "income");
    const cash = await makeLegacyAccount("Main Cash", "asset_cash");

    const result = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: cash, debit: 500, credit: 0 }, { accountId: income, debit: 0, credit: 500 }] },
      TENANT,
    );

    expect(result.ok).toBe(true);
    expect((result as any).body.voucherType).toBe("receipt");
  });

  it("classifies a pure Cash<->Bank transfer as a Contra Voucher", async () => {
    const cash = await makeLegacyAccount("Main Cash", "asset_cash");
    const bank = await makeLegacyAccount("Bank Current Account", "asset_cash");

    const result = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: bank, debit: 500, credit: 0 }, { accountId: cash, debit: 0, credit: 500 }] },
      TENANT,
    );

    expect(result.ok).toBe(true);
    expect((result as any).body.voucherType).toBe("contra");
  });

  it("classifies Income Cr / Asset(Receivable) Dr as a Sales Voucher, and Expense Dr / Liability(Payable) Cr as a Purchase Voucher", async () => {
    const income = await makeLegacyAccount("Sales Revenue", "income");
    const receivable = await makeLegacyAccount("Accounts Receivable", "asset_receivable");
    const salesResult = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: receivable, debit: 1000, credit: 0 }, { accountId: income, debit: 0, credit: 1000 }] },
      TENANT,
    );
    expect(salesResult.ok).toBe(true);
    expect((salesResult as any).body.voucherType).toBe("sales");

    const expense = await makeLegacyAccount("Purchases", "expense");
    const payable = await makeLegacyAccount("Accounts Payable", "liability_payable");
    const purchaseResult = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: expense, debit: 1000, credit: 0 }, { accountId: payable, debit: 0, credit: 1000 }] },
      TENANT,
    );
    expect(purchaseResult.ok).toBe(true);
    expect((purchaseResult as any).body.voucherType).toBe("purchase");
  });

  it("allows an authorized override for a non-standard pairing and records an audit trail instead of hard-blocking", async () => {
    const salary = await makeLegacyAccount("Salary Expense", "expense");
    const capital = await makeLegacyAccount("Owner Capital", "equity");

    const result = await applySemanticRulesAndClassify(
      {
        lineIds: [{ accountId: salary, debit: 1000, credit: 0 }, { accountId: capital, debit: 0, credit: 1000 }],
        allowNonStandard: true,
        overrideReason: "Owner draw adjustment",
      },
      TENANT,
    );

    expect(result.ok).toBe(true);
    expect((result as any).body.semanticOverride).toEqual({
      applied: true,
      warning: expect.stringMatching(/expense must be offset/i),
      reason: "Owner draw adjustment",
    });
  });

  // Regression: real bank accounts added via the Banking page use the new
  // Chart-of-Accounts feature schema (accountType ref -> AccountType.segment)
  // and have no legacy account_type at all. Before this fix, such accounts
  // were invisible to the classifier, so a completely standard "pay an
  // expense from a real bank account" entry was wrongly blocked as if the
  // expense had no cash/bank offset at all.
  it("recognizes a modern-schema (Chart-of-Accounts feature) bank account as cash/bank", async () => {
    const salary = await makeLegacyAccount("Salary Expense", "expense");
    const bank = await makeModernAccount("HDFC Bank - Current Account", "Bank", "Cash and cash equivalents");

    const result = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: salary, debit: 5000, credit: 0 }, { accountId: bank, debit: 0, credit: 5000 }] },
      TENANT,
    );

    expect(result.ok).toBe(true);
    expect((result as any).body.voucherType).toBe("payment");
  });

  it("does not misclassify a modern-schema Expense/Income account without a legacy account_type", async () => {
    const expense = await makeModernAccount("Office Supplies", "Expense", "Expense");
    const bank = await makeModernAccount("ICICI Bank - Current Account", "Bank", "Cash and cash equivalents");

    const result = await applySemanticRulesAndClassify(
      { lineIds: [{ accountId: expense, debit: 200, credit: 0 }, { accountId: bank, debit: 0, credit: 200 }] },
      TENANT,
    );

    expect(result.ok).toBe(true);
    expect((result as any).body.voucherType).toBe("payment");
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import Account from "@/models/finance/Account";
import AccountType from "@/models/finance/AccountType";
import Accountant from "@/models/finance/Accountant";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { seedNewChartOfAccounts } from "@/lib/accounting/coa-feature-seeder";

describe("AUP-005: Chart of Accounts Classification & Deduplication", () => {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/aupulens_test_coa";
  const tenantId = `test-coa-${Date.now()}`;
  const userId = new mongoose.Types.ObjectId().toString();

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
    await Promise.all([Account.init(), AccountType.init(), Accountant.init()]);
  });

  afterAll(async () => {
    await Account.deleteMany({ tenantId });
    await AccountType.deleteMany({ tenantId });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await Account.deleteMany({ tenantId });
    await AccountType.deleteMany({ tenantId });
  });

  it("populates internal_group and account_type for all seeded accounts", async () => {
    await seedNewChartOfAccounts(tenantId, userId);

    const accounts = await Account.find({ tenantId });
    expect(accounts.length).toBeGreaterThan(50);

    const unclassified = accounts.filter(
      (a) => !a.internal_group || a.internal_group === "off_balance"
    );
    expect(unclassified.length).toBe(0);

    const validGroups = new Set(["asset", "liability", "equity", "income", "expense"]);
    for (const acc of accounts) {
      expect(validGroups.has(acc.internal_group!)).toBe(true);
      expect(acc.account_type).toBeDefined();
      expect(acc.account_type).not.toBe("off_balance");
    }
  });

  it("deduplicates control accounts when both seeders run", async () => {
    // 1. Seed base default accounts (ensureChartOfAccounts)
    await ensureChartOfAccounts(tenantId, userId);

    // 2. Run feature seeder (seedNewChartOfAccounts)
    await seedNewChartOfAccounts(tenantId, userId);

    // Verify exactly one Accounts Receivable account exists for this tenant
    const arAccounts = await Account.find({
      tenantId,
      $or: [{ code: "1200" }, { accountName: "Accounts Receivable" }, { name: "Accounts Receivable" }],
    });
    expect(arAccounts.length).toBe(1);
    expect(arAccounts[0].code).toBe("1200");
    expect(arAccounts[0].internal_group).toBe("asset");
    expect(arAccounts[0].account_type).toBe("asset_receivable");
    expect(arAccounts[0].reconcile).toBe(true);

    // Verify exactly one Accounts Payable account exists for this tenant
    const apAccounts = await Account.find({
      tenantId,
      $or: [{ code: "2100" }, { accountName: "Accounts Payable" }, { name: "Accounts Payable" }],
    });
    expect(apAccounts.length).toBe(1);
    expect(apAccounts[0].code).toBe("2100");
    expect(apAccounts[0].internal_group).toBe("liability");
    expect(apAccounts[0].account_type).toBe("liability_payable");
    expect(apAccounts[0].reconcile).toBe(true);

    // Verify Retained Earnings
    const reAccounts = await Account.find({
      tenantId,
      $or: [{ code: "3200" }, { accountName: "Retained Earnings" }, { name: "Retained Earnings" }],
    });
    expect(reAccounts.length).toBe(1);
    expect(reAccounts[0].internal_group).toBe("equity");
  });
});

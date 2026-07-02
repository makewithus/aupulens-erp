import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import BankingRule from "@/models/BankingRule";

describe("BankingRule model", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_banking_rule");
    await BankingRule.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await BankingRule.deleteMany({});
  });

  const baseRule = () => ({
    ruleName: "Office Rent",
    applyTo: "withdrawals",
    transactionHandling: "recognized",
    criteriaMatch: "any",
    criteria: [{ field: "Description", operator: "Contains", value: "Rent" }],
    recordAs: "expense",
    accountId: new mongoose.Types.ObjectId(),
    associateAccountsMode: "custom",
    createdBy: new mongoose.Types.ObjectId(),
  });

  it("applies defaults for applyTo, transactionHandling, criteriaMatch, and associateAccountsMode", async () => {
    const doc = await BankingRule.create({
      tenantId: "t1",
      ruleName: "Default rule",
      criteria: [{ field: "Description", operator: "Contains", value: "x" }],
      recordAs: "income",
      accountId: new mongoose.Types.ObjectId(),
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(doc.applyTo).toBe("deposits");
    expect(doc.transactionHandling).toBe("recognized");
    expect(doc.criteriaMatch).toBe("any");
    expect(doc.associateAccountsMode).toBe("custom");
    expect(doc.status).toBe("active");
  });

  it("persists criteria as an array of {field, operator, value}", async () => {
    const doc = await BankingRule.create({ tenantId: "t1", ...baseRule() });
    const fetched = await BankingRule.findById(doc._id).lean();

    expect(fetched?.criteria).toHaveLength(1);
    expect(fetched?.criteria[0]).toMatchObject({ field: "Description", operator: "Contains", value: "Rent" });
  });

  it("rejects a rule with zero criteria", async () => {
    await expect(
      BankingRule.create({
        tenantId: "t1",
        ...baseRule(),
        criteria: [],
      }),
    ).rejects.toThrow();
  });

  it("enforces tenant-scoped uniqueness on ruleName", async () => {
    await BankingRule.create({ tenantId: "t1", ...baseRule() });

    await expect(BankingRule.create({ tenantId: "t1", ...baseRule() })).rejects.toThrow(/E11000/);

    const t2 = await BankingRule.create({ tenantId: "t2", ...baseRule() });
    expect(t2.ruleName).toBe("Office Rent");
  });

  it("rejects an invalid recordAs enum value", async () => {
    await expect(
      BankingRule.create({ tenantId: "t1", ...baseRule(), recordAs: "not_a_real_type" }),
    ).rejects.toThrow();
  });
});

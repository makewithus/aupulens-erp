import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import Budget from "@/models/finance/Budget";

describe("Budget model", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_budget");
    await Budget.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Budget.deleteMany({});
  });

  const baseBudget = () => ({
    name: "FY26-27 Budget",
    fiscalYear: "Apr 2026 - Mar 2027",
    period: "monthly",
    lines: [
      {
        accountId: new mongoose.Types.ObjectId(),
        segment: "income",
        amounts: [
          { periodLabel: "Apr 2026", amount: 100000 },
          { periodLabel: "May 2026", amount: 120000 },
        ],
      },
    ],
    createdBy: new mongoose.Types.ObjectId(),
  });

  it("defaults period to monthly and status to active", async () => {
    const doc = await Budget.create({
      tenantId: "t1",
      name: "Minimal Budget",
      fiscalYear: "Apr 2026 - Mar 2027",
      createdBy: new mongoose.Types.ObjectId(),
    });
    expect(doc.period).toBe("monthly");
    expect(doc.status).toBe("active");
    expect(doc.includeBalanceSheetAccounts).toBe(false);
  });

  it("persists per-period line amounts and sums correctly", async () => {
    const doc = await Budget.create({ tenantId: "t1", ...baseBudget() });
    const fetched = await Budget.findById(doc._id).lean();

    expect(fetched?.lines).toHaveLength(1);
    const total = fetched!.lines[0].amounts.reduce((sum, a) => sum + a.amount, 0);
    expect(total).toBe(220000);
  });

  it("enforces tenant-scoped uniqueness on name + fiscalYear", async () => {
    await Budget.create({ tenantId: "t1", ...baseBudget() });
    await expect(Budget.create({ tenantId: "t1", ...baseBudget() })).rejects.toThrow(/E11000/);

    const otherYear = await Budget.create({
      tenantId: "t1",
      ...baseBudget(),
      fiscalYear: "Apr 2027 - Mar 2028",
    });
    expect(otherYear.fiscalYear).toBe("Apr 2027 - Mar 2028");

    const t2 = await Budget.create({ tenantId: "t2", ...baseBudget() });
    expect(t2.name).toBe("FY26-27 Budget");
  });

  it("rejects an invalid segment enum value on a line", async () => {
    await expect(
      Budget.create({
        tenantId: "t1",
        ...baseBudget(),
        lines: [{ accountId: new mongoose.Types.ObjectId(), segment: "not_real", amounts: [] }],
      }),
    ).rejects.toThrow();
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import JournalTemplate from "@/models/JournalTemplate";
import CurrencyAdjustment from "@/models/CurrencyAdjustment";

describe("JournalTemplate and CurrencyAdjustment models", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_journal_template");
    await JournalTemplate.init();
    await CurrencyAdjustment.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await JournalTemplate.deleteMany({});
    await CurrencyAdjustment.deleteMany({});
  });

  it("defaults reportingMethod to accrual_and_cash and currency to INR", async () => {
    const doc = await JournalTemplate.create({
      tenantId: "t1",
      templateName: "Monthly Rent",
      notes: "Recurring rent entry",
      lines: [{ accountId: new mongoose.Types.ObjectId(), type: "debit" }],
      createdBy: new mongoose.Types.ObjectId(),
    });
    expect(doc.reportingMethod).toBe("accrual_and_cash");
    expect(doc.currency).toBe("INR");
  });

  it("enforces tenant-scoped uniqueness on templateName", async () => {
    const userId = new mongoose.Types.ObjectId();
    await JournalTemplate.create({ tenantId: "t1", templateName: "Monthly Rent", notes: "x", createdBy: userId });

    await expect(
      JournalTemplate.create({ tenantId: "t1", templateName: "Monthly Rent", notes: "y", createdBy: userId }),
    ).rejects.toThrow(/E11000/);

    const t2 = await JournalTemplate.create({ tenantId: "t2", templateName: "Monthly Rent", notes: "z", createdBy: userId });
    expect(t2.tenantId).toBe("t2");
  });

  it("persists CurrencyAdjustment with a computed gainOrLoss", async () => {
    const doc = await CurrencyAdjustment.create({
      tenantId: "t1",
      currency: "USD",
      baseCurrency: "INR",
      dateOfAdjustment: new Date("2026-03-31"),
      exchangeRate: 84.5,
      previousExchangeRate: 83.2,
      gainOrLoss: 130,
      notes: "Quarter-end revaluation",
      createdBy: new mongoose.Types.ObjectId(),
    });
    expect(doc.gainOrLoss).toBe(130);
    expect(doc.currency).toBe("USD");
  });

  it("does not enforce any uniqueness across multiple adjustments for the same currency", async () => {
    const userId = new mongoose.Types.ObjectId();
    const base = { tenantId: "t1", currency: "USD", baseCurrency: "INR", exchangeRate: 84, notes: "x", createdBy: userId };
    await CurrencyAdjustment.create({ ...base, dateOfAdjustment: new Date("2026-01-01") });
    const second = await CurrencyAdjustment.create({ ...base, dateOfAdjustment: new Date("2026-02-01") });
    expect(second.currency).toBe("USD");
    expect(await CurrencyAdjustment.countDocuments({ tenantId: "t1", currency: "USD" })).toBe(2);
  });
});

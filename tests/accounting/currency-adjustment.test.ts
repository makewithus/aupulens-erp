import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import CurrencyAdjustment from "@/models/finance/CurrencyAdjustment";

describe("CurrencyAdjustment model", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_currency_adjustment");
    await CurrencyAdjustment.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await CurrencyAdjustment.deleteMany({});
  });

  const base = () => ({
    currency: "USD",
    baseCurrency: "INR",
    dateOfAdjustment: new Date("2026-03-31"),
    exchangeRate: 83.5,
    notes: "Quarter-end revaluation",
    createdBy: new mongoose.Types.ObjectId(),
  });

  it("defaults gainOrLoss to 0 when not supplied", async () => {
    const doc = await CurrencyAdjustment.create({ tenantId: "t1", ...base() });
    expect(doc.gainOrLoss).toBe(0);
  });

  it("persists gain/loss and previous exchange rate", async () => {
    const doc = await CurrencyAdjustment.create({
      tenantId: "t1",
      ...base(),
      previousExchangeRate: 82.0,
      gainOrLoss: 1500,
    });
    expect(doc.previousExchangeRate).toBe(82.0);
    expect(doc.gainOrLoss).toBe(1500);
  });

  it("allows multiple adjustments for the same tenant + currency (log, not unique)", async () => {
    await CurrencyAdjustment.create({ tenantId: "t1", ...base() });
    const second = await CurrencyAdjustment.create({
      tenantId: "t1",
      ...base(),
      dateOfAdjustment: new Date("2026-06-30"),
    });
    const count = await CurrencyAdjustment.countDocuments({ tenantId: "t1", currency: "USD" });
    expect(count).toBe(2);
    expect(second.dateOfAdjustment.toISOString()).toContain("2026-06-30");
  });

  it("isolates tenants scoping the same currency+date", async () => {
    await CurrencyAdjustment.create({ tenantId: "t1", ...base() });
    await CurrencyAdjustment.create({ tenantId: "t2", ...base() });
    const t1Count = await CurrencyAdjustment.countDocuments({ tenantId: "t1" });
    const t2Count = await CurrencyAdjustment.countDocuments({ tenantId: "t2" });
    expect(t1Count).toBe(1);
    expect(t2Count).toBe(1);
  });

  it("requires notes, exchangeRate, and dateOfAdjustment", async () => {
    await expect(
      CurrencyAdjustment.create({
        tenantId: "t1",
        currency: "USD",
        baseCurrency: "INR",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow();
  });
});

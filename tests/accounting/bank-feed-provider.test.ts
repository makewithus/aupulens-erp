import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import BankFeedProvider from "@/models/BankFeedProvider";
import { seedBankFeedProviders } from "@/lib/accounting/bankFeedProviderSeeder";

describe("BankFeedProvider model (global, non-tenant-scoped catalog)", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_bank_feed_provider");
    await BankFeedProvider.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await BankFeedProvider.deleteMany({});
  });

  it("defaults isActive to true and country to IN", async () => {
    const doc = await BankFeedProvider.create({ name: "Test Bank", type: "aggregator" });
    expect(doc.isActive).toBe(true);
    expect(doc.country).toBe("IN");
  });

  it("enforces a global unique index on name — no tenantId field exists on the schema", async () => {
    await BankFeedProvider.create({ name: "Duplicate Bank", type: "aggregator" });
    await expect(
      BankFeedProvider.create({ name: "Duplicate Bank", type: "partner_direct" }),
    ).rejects.toThrow(/E11000/);
    expect(BankFeedProvider.schema.path("tenantId")).toBeUndefined();
  });

  it("rejects an invalid type enum value", async () => {
    await expect(
      BankFeedProvider.create({ name: "Bad Type Bank", type: "not_real" }),
    ).rejects.toThrow();
  });

  it("seedBankFeedProviders populates the shared catalog once and is idempotent", async () => {
    await seedBankFeedProviders();
    const firstCount = await BankFeedProvider.countDocuments();
    expect(firstCount).toBeGreaterThan(0);

    await seedBankFeedProviders();
    const secondCount = await BankFeedProvider.countDocuments();
    expect(secondCount).toBe(firstCount);
  });
});

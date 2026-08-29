import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import BankAccount from "@/models/finance/BankAccount";
import BankFeedProvider from "@/models/finance/BankFeedProvider";

describe("BankAccount and BankFeedProvider models", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_bank_account");
    await BankAccount.init();
    await BankFeedProvider.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await BankAccount.deleteMany({});
    await BankFeedProvider.deleteMany({});
  });

  it("defaults accountType to bank and connectionStatus to manual", async () => {
    const doc = await BankAccount.create({
      tenantId: "t1",
      accountName: "HDFC Current",
      currency: "INR",
      createdBy: new mongoose.Types.ObjectId(),
    });
    expect(doc.accountType).toBe("bank");
    expect(doc.connectionStatus).toBe("manual");
    expect(doc.isPrimary).toBe(false);
  });

  it("enforces tenant-scoped uniqueness on accountName", async () => {
    const userId = new mongoose.Types.ObjectId();
    await BankAccount.create({ tenantId: "t1", accountName: "HDFC Current", currency: "INR", createdBy: userId });

    await expect(
      BankAccount.create({ tenantId: "t1", accountName: "HDFC Current", currency: "INR", createdBy: userId }),
    ).rejects.toThrow(/E11000/);

    const t2 = await BankAccount.create({ tenantId: "t2", accountName: "HDFC Current", currency: "INR", createdBy: userId });
    expect(t2.tenantId).toBe("t2");
  });

  it("rejects an invalid accountType enum value", async () => {
    await expect(
      BankAccount.create({
        tenantId: "t1",
        accountName: "Weird Account",
        accountType: "savings",
        currency: "INR",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow();
  });

  it("enforces a globally unique provider name on BankFeedProvider (not tenant-scoped — a shared catalog)", async () => {
    await BankFeedProvider.create({ name: "HSBC", type: "partner_direct" });
    await expect(BankFeedProvider.create({ name: "HSBC", type: "aggregator" })).rejects.toThrow(/E11000/);
  });

  it("defaults BankFeedProvider isActive to true and supportsCreditCard to false", async () => {
    const doc = await BankFeedProvider.create({ name: "ICICI Bank (India)", type: "aggregator" });
    expect(doc.isActive).toBe(true);
    expect(doc.supportsCreditCard).toBe(false);
  });
});

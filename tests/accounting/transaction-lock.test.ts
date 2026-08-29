import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import TransactionLock from "@/models/finance/TransactionLock";

describe("TransactionLock model", () => {
  beforeAll(async () => {
    await mongoose.connect("mongodb://localhost:27017/aupulens_test_transaction_lock");
    await TransactionLock.init();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await TransactionLock.deleteMany({});
  });

  it("defaults isLocked to false and lockedUpToDate to null", async () => {
    const doc = await TransactionLock.create({ tenantId: "t1", module: "sales" });
    expect(doc.isLocked).toBe(false);
    expect(doc.lockedUpToDate).toBeNull();
  });

  it("enforces a compound unique index on {tenantId, module}", async () => {
    await TransactionLock.create({ tenantId: "t1", module: "sales", isLocked: true, lockedUpToDate: new Date("2026-03-31") });
    await expect(TransactionLock.create({ tenantId: "t1", module: "sales" })).rejects.toThrow(/E11000/);

    // Different module, same tenant — allowed
    const purchases = await TransactionLock.create({ tenantId: "t1", module: "purchases" });
    expect(purchases.module).toBe("purchases");

    // Same module, different tenant — allowed
    const t2 = await TransactionLock.create({ tenantId: "t2", module: "sales" });
    expect(t2.tenantId).toBe("t2");
  });

  it("rejects an invalid module enum value", async () => {
    await expect(TransactionLock.create({ tenantId: "t1", module: "not_a_module" })).rejects.toThrow();
  });
});

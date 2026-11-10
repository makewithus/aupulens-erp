import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_outbox_boot";

import AiEvent from "@/models/ai/AiEvent";
import AccountType from "@/models/finance/AccountType";

/**
 * Regression for a bug introduced by the transactional outbox (found by tests/sales/pipelineDeals and
 * tests/crm/crmWorkflowRegression): with `transactionAsyncLocalStorage` on, the model registry compiled lazily
 * inside the first accounting transaction ran its createCollection/createIndexes IN that transaction and
 * conflicted with the transaction's own writes ("Unable to acquire ticket ... lock conflict ... accounttypes").
 */
describe("first accounting transaction in a cold process", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!); // deliberately NOT lib/db connectDB(): models are not registered yet
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });

  it("registers the model registry before the transaction starts and commits business row + outbox row without a lock conflict", async () => {
    const before = mongoose.modelNames().length;
    expect(before).toBeLessThan(10);

    const { withAccountingTransaction } = await import("@/lib/accounting/transaction");
    const { safeEmitEvent } = await import("@/lib/aiRuntime/runtime/safeEmit");
    let registeredAtStart = 0;
    await withAccountingTransaction(async () => {
      registeredAtStart = mongoose.modelNames().length; // must already be loaded: compiling models inside the tx is the bug
      await AccountType.create({ tenantId: "boot", name: "Cash", segment: "assets" } as any).catch(async () => {
        // fall back to a minimal raw write if the schema requires more fields: the point is a first-touch write of a cold collection
        await AccountType.collection.insertOne({ tenantId: "boot", name: "Cash" }, { session: (await import("@/lib/accounting/transaction")).getAccountingSession() });
      });
      await safeEmitEvent("boot", "journal.posted", { journalEntryId: "j-boot" });
    });

    expect(registeredAtStart).toBeGreaterThan(30); // registry was loaded BEFORE the transaction callback ran
    expect(await AccountType.countDocuments({ tenantId: "boot" })).toBe(1);
    expect(await AiEvent.countDocuments({ tenantId: "boot", eventKey: "journal.posted", status: "pending" })).toBe(1);
  });
});

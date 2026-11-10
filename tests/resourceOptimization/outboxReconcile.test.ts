import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_reconcile";

import connectDB from "@/lib/db";
import AiEvent from "@/models/ai/AiEvent";
import Invoice from "@/models/finance/Invoice";
import Expense from "@/models/finance/Expense";
import { reconcileMissingCreationEvents } from "@/lib/aiRuntime/runtime/reconcile";
import { creationDedupeKey } from "@/lib/aiRuntime/runtime/reconcileKeys";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

// ObjectId whose embedded timestamp is `ageMs` in the past, with a random tail so ids stay unique.
const oid = (ageMs = 0) =>
  new mongoose.Types.ObjectId(Math.floor((Date.now() - ageMs) / 1000).toString(16).padStart(8, "0") + new mongoose.Types.ObjectId().toHexString().slice(8));
let seq = 0;
const insert = (M: any, doc: Record<string, unknown>) => M.collection.insertOne({ name: `n${++seq}`, ...doc });

describe("outbox reconciliation of creation events lost after a committed business write", () => {
  beforeAll(async () => { await connectDB(); });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });
  beforeEach(async () => { await AiEvent.deleteMany({}); await Invoice.collection.deleteMany({}); await Expense.collection.deleteMany({}); });

  it("recovers a committed invoice whose event was never persisted, exactly once, with the producer's key", async () => {
    const id = oid(60_000);
    await insert(Invoice, { _id: id, tenantId: "t1", moveType: "out_invoice" });
    const first = await reconcileMissingCreationEvents(["t1"]);
    expect(first.recovered).toBe(1);
    const ev = await AiEvent.find({ tenantId: "t1", eventKey: "invoice.created" }).lean();
    expect(ev).toHaveLength(1);
    expect(ev[0].dedupeKey).toBe(creationDedupeKey(id));
    expect(ev[0].status).toBe("pending");
    expect(ev[0].payload).toEqual({ invoiceId: String(id), moveType: "out_invoice" }); // no actingUserId => observe-only
    expect((await reconcileMissingCreationEvents(["t1"])).recovered).toBe(0); // idempotent
    expect(await AiEvent.countDocuments({ tenantId: "t1" })).toBe(1);
  });

  it("does not duplicate an event the producer already persisted (same deterministic key), nor resurrect a processed one", async () => {
    const id = oid(60_000);
    await insert(Invoice, { _id: id, tenantId: "t1", moveType: "out_invoice" });
    await safeEmitEvent("t1", "invoice.created", { invoiceId: String(id), moveType: "out_invoice", actingUserId: "u1" }, { dedupeKey: creationDedupeKey(id) });
    await AiEvent.updateOne({ tenantId: "t1", eventKey: "invoice.created" }, { $set: { status: "processed" } });
    expect((await reconcileMissingCreationEvents(["t1"])).recovered).toBe(0);
    const ev = await AiEvent.find({ tenantId: "t1" }).lean();
    expect(ev).toHaveLength(1);
    expect(ev[0].status).toBe("processed");
    expect((ev[0].payload as any).actingUserId).toBe("u1"); // producer's richer payload preserved
  });

  it("is tenant-scoped, ignores documents older than the lookback and sources it does not own (vendor bills)", async () => {
    await insert(Invoice, { _id: oid(60_000), tenantId: "t1", moveType: "out_invoice" });
    await insert(Invoice, { _id: oid(60_000), tenantId: "t2", moveType: "out_invoice" });
    await insert(Invoice, { _id: oid(10 * 3600_000), tenantId: "t1", moveType: "out_invoice" }); // older than 3h
    await insert(Invoice, { _id: oid(60_000), tenantId: "t1", moveType: "in_invoice" }); // bill.created is not reconciled
    await insert(Expense, { _id: oid(60_000), tenantId: "t1" });
    const r = await reconcileMissingCreationEvents(["t1"]);
    expect(r.byEvent).toEqual({ "invoice.created": 1, "expense.submitted": 1 });
    expect(await AiEvent.countDocuments({ tenantId: "t2" })).toBe(0);
  });

  it("recovers many documents in batches without loss", async () => {
    await Invoice.collection.insertMany(Array.from({ length: 1200 }, () => ({ _id: new mongoose.Types.ObjectId(), name: `n${++seq}`, tenantId: "t1", moveType: "out_invoice" })));
    expect((await reconcileMissingCreationEvents(["t1"])).recovered).toBe(1200);
    expect(await AiEvent.countDocuments({ tenantId: "t1", eventKey: "invoice.created" })).toBe(1200);
  });

  it("a database failure is surfaced to the caller (never silently swallowed) and the next run recovers", async () => {
    await insert(Invoice, { _id: oid(60_000), tenantId: "t1", moveType: "out_invoice" });
    const spy = vi.spyOn(AiEvent, "bulkWrite").mockRejectedValueOnce(new Error("db down"));
    await expect(reconcileMissingCreationEvents(["t1"])).rejects.toThrow("db down");
    spy.mockRestore();
    expect((await reconcileMissingCreationEvents(["t1"])).recovered).toBe(1);
  });
});

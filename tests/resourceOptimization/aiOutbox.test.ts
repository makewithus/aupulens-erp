import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { NextRequest } from "next/server";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ro_outbox";

import AiEvent from "@/models/ai/AiEvent";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import PlatformAlert from "@/models/platform/PlatformAlert";
import Department from "@/models/hr/Department";

type EB = typeof import("@/lib/aiRuntime/runtime/eventBus");
let eb: EB;
let safeEmit: typeof import("@/lib/aiRuntime/runtime/safeEmit");
let health: typeof import("@/lib/aiRuntime/runtime/outboxHealth");
let withAccountingTransaction: typeof import("@/lib/accounting/transaction").withAccountingTransaction;
let registerWorkflow: typeof import("@/lib/aiRuntime/runtime/registry").registerWorkflow;
let smoke: any;
const T = "ro-outbox";
const FAIL_KEY = "ro.always.fails";
const SLOW_KEY = "ro.slow";

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all([AiEvent.init(), AiWorkflowRun.init(), PlatformAlert.init(), Department.init()]);
  eb = await import("@/lib/aiRuntime/runtime/eventBus");
  safeEmit = await import("@/lib/aiRuntime/runtime/safeEmit");
  health = await import("@/lib/aiRuntime/runtime/outboxHealth");
  ({ withAccountingTransaction } = await import("@/lib/accounting/transaction"));
  ({ registerWorkflow } = await import("@/lib/aiRuntime/runtime/registry"));
  const { bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap");
  ({ aiSmokeWorkflow: smoke } = await import("@/lib/aiRuntime/workflows/ai-00-smoke"));
  bootstrapAiRuntime();
  registerWorkflow({ ...smoke, id: "RO-FAIL", eventKeys: [FAIL_KEY], observe: async () => { throw new Error("boom"); } });
  registerWorkflow({ ...smoke, id: "RO-SLOW", eventKeys: [SLOW_KEY], observe: async (e: any) => { await new Promise((r) => setTimeout(r, 120)); return smoke.observe(e); } });
});
afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.connection.close(); });
beforeEach(() => safeEmit.resetOutboxInsertFailures());
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([AiEvent.deleteMany({}), AiWorkflowRun.deleteMany({}), PlatformAlert.deleteMany({}), Department.deleteMany({})]);
});

const dept = (name: string) => ({ tenantId: T, name, code: name.slice(0, 6).toUpperCase(), isActive: true, createdBy: new mongoose.Types.ObjectId() });
const pastLease = () => AiEvent.updateMany({ status: "processing" }, { $set: { leaseUntil: new Date(Date.now() - 1000) } });

describe("G6 — business transaction and outbox row are consistent", () => {
  it("commit: business record and event both exist", async () => {
    await withAccountingTransaction(async () => {
      await Department.create(dept("Committed"));
      await safeEmit.safeEmitEvent(T, "journal.posted", { journalEntryId: "j1" });
    });
    expect(await Department.countDocuments({ name: "Committed" })).toBe(1);
    const ev = await AiEvent.findOne({ eventKey: "journal.posted" }).lean();
    expect(ev?.status).toBe("pending");
  });

  it("rollback: neither the business record nor the event exists", async () => {
    await expect(withAccountingTransaction(async () => {
      await Department.create(dept("RolledBack"));
      await safeEmit.safeEmitEvent(T, "journal.posted", { journalEntryId: "j2" });
      throw new Error("business failure");
    })).rejects.toThrow("business failure");
    expect(await Department.countDocuments({ name: "RolledBack" })).toBe(0);
    expect(await AiEvent.countDocuments({ eventKey: "journal.posted" })).toBe(0);
  });

  it("event insertion failure INSIDE a transaction aborts the business write instead of being swallowed", async () => {
    vi.spyOn(AiEvent, "create").mockRejectedValue(new Error("outbox down"));
    await expect(withAccountingTransaction(async () => {
      await Department.create(dept("ShouldNotPersist"));
      await safeEmit.safeEmitEvent(T, "invoice.created", { invoiceId: "i1" });
    })).rejects.toThrow("outbox down");
    expect(await Department.countDocuments({ name: "ShouldNotPersist" })).toBe(0);
  });

  it("insertion failure OUTSIDE a transaction is retried, counted and logged as structured error (never silent), without throwing into a committed request", async () => {
    const spy = vi.spyOn(AiEvent, "create").mockRejectedValue(new Error("db blip"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(safeEmit.safeEmitEvent(T, "invoice.created", { invoiceId: "i2" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(3);
    expect(safeEmit.getOutboxInsertFailures()).toEqual({ total: 1, critical: 1 });
    const line = JSON.parse(log.mock.calls[0][0] as string);
    expect(line).toMatchObject({ msg: "ai-outbox: failed to persist event", eventKey: "invoice.created", critical: true, error: "db blip" });
    await safeEmit.safeEmitEvent(T, "master_data.changed", {});
    expect(safeEmit.getOutboxInsertFailures()).toEqual({ total: 2, critical: 1 });
  });

  it("a transient insert failure is retried and succeeds", async () => {
    const real = AiEvent.create.bind(AiEvent) as any;
    vi.spyOn(AiEvent, "create").mockRejectedValueOnce(new Error("transient")).mockImplementation(real);
    await safeEmit.safeEmitEvent(T, "bill.created", { invoiceId: "b1" });
    expect(await AiEvent.countDocuments({ eventKey: "bill.created" })).toBe(1);
    expect(safeEmit.getOutboxInsertFailures().total).toBe(0);
  });

  it("duplicate emission: 10 concurrent identical dedupeKeys (outside a tx) store exactly one row", async () => {
    await Promise.all(Array.from({ length: 10 }, () => safeEmit.safeEmitEvent(T, "ai.sweep.hourly", {}, { dedupeKey: "k1" })));
    expect(await AiEvent.countDocuments({ eventKey: "ai.sweep.hourly", dedupeKey: "k1" })).toBe(1);
  });

  it("duplicate emission inside one transaction stores one row and does not abort the transaction", async () => {
    await withAccountingTransaction(async () => {
      await Department.create(dept("DupTx"));
      await safeEmit.safeEmitEvent(T, "journal.posted", { a: 1 }, { dedupeKey: "same" });
      await safeEmit.safeEmitEvent(T, "journal.posted", { a: 1 }, { dedupeKey: "same" });
    });
    expect(await AiEvent.countDocuments({ dedupeKey: "same" })).toBe(1);
    expect(await Department.countDocuments({ name: "DupTx" })).toBe(1);
  });
});

describe("G6 — atomic claiming, leases and crash recovery", () => {
  it("4 concurrent workers over 60 events: every event claimed exactly once, none lost", async () => {
    await AiEvent.insertMany(Array.from({ length: 60 }, (_, i) => ({ tenantId: T, eventKey: "ro.nobody.listens", payload: { i }, dedupeKey: `d${i}`, status: "pending" })));
    const results = await Promise.all([1, 2, 3, 4].map((n) => eb.sweepPendingEvents(100, 30_000, { workerId: `w${n}` })));
    expect(results.reduce((a, r) => a + r.claimed, 0)).toBe(60);
    const all = await AiEvent.find({}).lean();
    expect(all.every((e) => e.status === "processed" && e.attempts === 1)).toBe(true);
  });

  it("claimEvent is exclusive: two simultaneous claims of the same single event give one winner", async () => {
    await AiEvent.create({ tenantId: T, eventKey: "ro.nobody.listens", dedupeKey: "x", status: "pending" });
    const [a, b] = await Promise.all([eb.claimEvent({ workerId: "A" }), eb.claimEvent({ workerId: "B" })]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("worker crash after claim: event stays leased (not double-run) until the lease expires, then is reclaimed and completed", async () => {
    await AiEvent.create({ tenantId: T, eventKey: "ro.nobody.listens", dedupeKey: "crash", status: "pending" });
    const claimed = await eb.claimEvent({ workerId: "crashing-worker" });
    expect(claimed?.status).toBe("processing");
    expect(claimed!.leaseUntil!.getTime()).toBeGreaterThan(Date.now());
    // ...worker dies here, never finishes...
    expect((await eb.sweepPendingEvents(10, 5_000)).claimed).toBe(0); // lease still valid
    await pastLease();
    const swept = await eb.sweepPendingEvents(10, 5_000);
    expect(swept.processed).toBe(1);
    const ev = await AiEvent.findOne({ dedupeKey: "crash" }).lean();
    expect(ev).toMatchObject({ status: "processed", attempts: 2 });
    expect(ev!.workerId).toBeUndefined();
  });

  it("legacy rows stranded in `processing` with no lease are recovered after the lease window", async () => {
    await AiEvent.collection.insertOne({ tenantId: T, eventKey: "ro.nobody.listens", dedupeKey: "legacy", status: "processing", attempts: 1, payload: {}, createdAt: new Date(0), updatedAt: new Date(0) });
    expect((await eb.sweepPendingEvents(10, 5_000)).processed).toBe(1);
  });

  it("a crashed worker on the FINAL attempt is dead-lettered, never stranded", async () => {
    await AiEvent.create({ tenantId: T, eventKey: "ro.nobody.listens", dedupeKey: "final", status: "processing", attempts: eb.MAX_ATTEMPTS, leaseUntil: new Date(Date.now() - 1000) });
    const r = await eb.sweepPendingEvents(10, 5_000);
    expect(r.deadLettered).toBe(1);
    expect(await AiEvent.findOne({ dedupeKey: "final" }).lean()).toMatchObject({ status: "dead_letter" });
  });
});

describe("G6 — retry, backoff, dead letter", () => {
  it("computeBackoffMs doubles and is capped", () => {
    const cfg = { leaseMs: 1, backoffBaseMs: 30_000, backoffMaxMs: 600_000 };
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => eb.computeBackoffMs(n, cfg))).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 600_000, 600_000]);
  });

  it("a failing event is NOT retried before nextAttemptAt, and is retried after it with a longer delay", async () => {
    await safeEmit.safeEmitEvent(T, FAIL_KEY, {});
    const r1 = await eb.sweepPendingEvents(10, 10_000);
    expect(r1.failed).toBe(1);
    let ev: any = await AiEvent.findOne({ eventKey: FAIL_KEY }).lean();
    expect(ev).toMatchObject({ status: "failed", attempts: 1, lastError: "boom" });
    const delay1 = ev.nextAttemptAt.getTime() - Date.now();
    expect(delay1).toBeGreaterThan(20_000);
    expect(delay1).toBeLessThanOrEqual(30_000);

    expect((await eb.sweepPendingEvents(10, 10_000)).claimed).toBe(0); // immediate re-sweep: nothing eligible

    await AiEvent.updateOne({ _id: ev._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1) } });
    await eb.sweepPendingEvents(10, 10_000);
    ev = await AiEvent.findOne({ eventKey: FAIL_KEY }).lean();
    expect(ev.attempts).toBe(2);
    const delay2 = ev.nextAttemptAt.getTime() - Date.now();
    expect(delay2).toBeGreaterThan(50_000);
  });

  it("after MAX_ATTEMPTS failures the event is dead-lettered with a timestamp and never claimed again", async () => {
    await safeEmit.safeEmitEvent(T, FAIL_KEY, {});
    for (let i = 0; i < eb.MAX_ATTEMPTS; i++) {
      await AiEvent.updateMany({ eventKey: FAIL_KEY }, { $set: { nextAttemptAt: new Date(Date.now() - 1) } });
      await eb.sweepPendingEvents(10, 10_000);
    }
    const ev: any = await AiEvent.findOne({ eventKey: FAIL_KEY }).lean();
    expect(ev).toMatchObject({ status: "dead_letter", attempts: eb.MAX_ATTEMPTS, lastError: "boom" });
    expect(ev.deadLetteredAt).toBeInstanceOf(Date);
    expect((await eb.sweepPendingEvents(10, 10_000)).claimed).toBe(0);
  });
});

describe("G6 — idempotent delivery, time budget, bursts", () => {
  it("re-delivering an already-executed event does not run the workflow twice (one AiWorkflowRun per workflow+event)", async () => {
    await safeEmit.safeEmitEvent(T, "ai.smoke.ping", { message: "hi" });
    await eb.sweepPendingEvents(10, 10_000);
    const ev: any = await AiEvent.findOne({ eventKey: "ai.smoke.ping" }).lean();
    await AiEvent.updateOne({ _id: ev._id }, { $set: { status: "pending" }, $unset: { processedAt: "" } }); // simulate duplicate delivery
    await eb.sweepPendingEvents(10, 10_000);
    expect(await AiWorkflowRun.countDocuments({ workflowId: "AI-00-SMOKE", triggerEventId: String(ev._id) })).toBe(1);
    expect((await AiEvent.findById(ev._id).lean())!.status).toBe("processed");
  });

  it("time budget is enforced with slow workflows; unfinished events stay queued", async () => {
    await AiEvent.insertMany(Array.from({ length: 10 }, (_, i) => ({ tenantId: T, eventKey: SLOW_KEY, dedupeKey: `s${i}`, status: "pending" })));
    const r = await eb.sweepPendingEvents(100, 400);
    expect(r.timedOut).toBe(true);
    expect(r.claimed).toBeGreaterThan(0);
    expect(r.claimed).toBeLessThan(10);
    expect(await AiEvent.countDocuments({ status: "pending" })).toBe(10 - r.claimed);
  });

  it("burst of 300 events drains across bounded sweeps with zero loss", async () => {
    await AiEvent.insertMany(Array.from({ length: 300 }, (_, i) => ({ tenantId: T, eventKey: "ro.nobody.listens", dedupeKey: `b${i}`, status: "pending" })));
    let sweeps = 0;
    while (await AiEvent.countDocuments({ status: "pending" })) { await eb.sweepPendingEvents(100, 20_000); if (++sweeps > 10) break; }
    expect(sweeps).toBeGreaterThanOrEqual(3); // 300 events / 100 per sweep; more only if a sweep hit its time budget under load
    expect(sweeps).toBeLessThanOrEqual(10);
    expect(await AiEvent.countDocuments({ status: "processed" })).toBe(300);
  });
});

describe("G6 — monitoring and alerts", () => {
  it("metrics report backlog, oldest age, expired leases, retries and dead letters", async () => {
    const old = new Date(Date.now() - 3_600_000);
    await AiEvent.collection.insertMany([
      { tenantId: T, eventKey: "k", dedupeKey: "m1", status: "pending", attempts: 0, createdAt: old, updatedAt: old },
      { tenantId: T, eventKey: "k", dedupeKey: "m2", status: "failed", attempts: 2, createdAt: new Date(), updatedAt: new Date() },
      { tenantId: T, eventKey: "k", dedupeKey: "m3", status: "processing", attempts: 1, leaseUntil: new Date(Date.now() - 5000), createdAt: new Date(), updatedAt: new Date() },
      { tenantId: T, eventKey: "k", dedupeKey: "m4", status: "dead_letter", attempts: 5, createdAt: new Date(), updatedAt: new Date() },
    ] as any);
    const m = await health.computeOutboxMetrics();
    expect(m).toMatchObject({ pending: 1, failedAwaitingRetry: 1, processing: 1, expiredLeases: 1, deadLetter: 1, retriedEvents: 2 });
    expect(m.oldestPendingAgeMs).toBeGreaterThan(3_500_000);
  });

  it("an old pending event raises a deduped stale alert, and it auto-resolves once the queue is drained", async () => {
    const old = new Date(Date.now() - 3_600_000);
    await AiEvent.collection.insertOne({ tenantId: T, eventKey: "ro.nobody.listens", dedupeKey: "old", status: "pending", attempts: 0, createdAt: old, updatedAt: old } as any);
    await health.checkOutboxHealth();
    await health.checkOutboxHealth(); // dedupe
    expect(await PlatformAlert.countDocuments({ alertType: "ai_outbox_stale", resolvedAt: { $exists: false } })).toBe(1);
    await eb.sweepPendingEvents(10, 10_000);
    await health.checkOutboxHealth();
    expect(await PlatformAlert.countDocuments({ alertType: "ai_outbox_stale", resolvedAt: { $exists: false } })).toBe(0);
  });

  it("backlog above the threshold raises a backlog alert", async () => {
    process.env.AI_OUTBOX_BACKLOG_THRESHOLD = "5";
    try {
      await AiEvent.insertMany(Array.from({ length: 8 }, (_, i) => ({ tenantId: T, eventKey: "ro.nobody.listens", dedupeKey: `bl${i}`, status: "pending" })));
      await health.checkOutboxHealth();
      expect(await PlatformAlert.countDocuments({ alertType: "ai_outbox_backlog", resolvedAt: { $exists: false } })).toBe(1);
    } finally { delete process.env.AI_OUTBOX_BACKLOG_THRESHOLD; }
  });
});

describe("G6 — cron authentication", () => {
  it("runtime-sweep route rejects missing/wrong bearer and an unset CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const saved = process.env.CRON_SECRET;
    try {
      process.env.CRON_SECRET = "good";
      expect((await POST(new NextRequest("http://x/api/cron/ai/runtime-sweep", { method: "POST" }))).status).toBe(401);
      expect((await POST(new NextRequest("http://x/api/cron/ai/runtime-sweep", { method: "POST", headers: { authorization: "Bearer bad" } }))).status).toBe(401);
      delete process.env.CRON_SECRET;
      expect((await POST(new NextRequest("http://x/api/cron/ai/runtime-sweep", { method: "POST", headers: { authorization: "Bearer undefined" } }))).status).toBe(401);
    } finally { if (saved !== undefined) process.env.CRON_SECRET = saved; }
  });
});

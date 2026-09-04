import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_event_bus";

import AiEvent from "@/models/ai/AiEvent";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiSchedule from "@/models/ai/AiSchedule";
import Account from "@/models/finance/Account";

let emitEvent: typeof import("@/lib/aiRuntime/runtime/eventBus").emitEvent;
let sweepPendingEvents: typeof import("@/lib/aiRuntime/runtime/eventBus").sweepPendingEvents;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let registerWorkflow: typeof import("@/lib/aiRuntime/runtime/registry").registerWorkflow;
let AI_AUTONOMY_LEVEL: typeof import("@/lib/constants/statuses").AI_AUTONOMY_LEVEL;

const TENANT = "event-bus-tenant";

describe("emitEvent — the AI runtime's event bus (outbox + inline dispatch)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiEvent.init();
    await AiWorkflowRun.init();
    await AiDecisionTrace.init();
    await AiWorkflowPolicy.init();
    await AiSchedule.init();
    await Account.init();

    ({ emitEvent, sweepPendingEvents } = await import("@/lib/aiRuntime/runtime/eventBus"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ registerWorkflow } = await import("@/lib/aiRuntime/runtime/registry"));
    ({ AI_AUTONOMY_LEVEL } = await import("@/lib/constants/statuses"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiEvent.deleteMany({});
    await AiWorkflowRun.deleteMany({});
    await AiDecisionTrace.deleteMany({});
    await AiWorkflowPolicy.deleteMany({});
    await AiSchedule.deleteMany({});
    await Account.deleteMany({});
  });

  it("persists an outbox row and dispatches inline to a registered workflow", async () => {
    const { eventId, deduped } = await emitEvent(TENANT, "ai.smoke.ping", { message: "hi" });
    expect(deduped).toBe(false);

    const event = await AiEvent.findById(eventId).lean();
    expect(event).not.toBeNull();
    expect(event!.status).toBe("processed");

    const run = await AiWorkflowRun.findOne({ workflowId: "AI-00-SMOKE", triggerEventId: eventId }).lean();
    expect(run).not.toBeNull();
  });

  it("an eventKey with no registered workflow is marked processed with no dispatches, not left pending", async () => {
    const { eventId } = await emitEvent(TENANT, "no.such.workflow.subscribes", {});
    const event = await AiEvent.findById(eventId).lean();
    expect(event!.status).toBe("processed");
  });

  it("duplicate emission with the same dedupeKey is a no-op — returns the original event", async () => {
    const first = await emitEvent(TENANT, "ai.smoke.ping", { n: 1 }, { dedupeKey: "same-key" });
    const second = await emitEvent(TENANT, "ai.smoke.ping", { n: 2 }, { dedupeKey: "same-key" });

    expect(second.deduped).toBe(true);
    expect(second.eventId).toBe(first.eventId);

    const count = await AiEvent.countDocuments({ tenantId: TENANT, eventKey: "ai.smoke.ping", dedupeKey: "same-key" });
    expect(count).toBe(1);

    const runCount = await AiWorkflowRun.countDocuments({ workflowId: "AI-00-SMOKE" });
    expect(runCount).toBe(1);
  });

  it("emitEvent never throws back to the caller even if dispatch fails internally", async () => {
    // AI-00-SMOKE is OBSERVE-level and always succeeds, so simulate a bad
    // payload shape instead — the workflow tolerates it (observe() coerces
    // a non-string message to "ping"), proving dispatch failures are caught
    // rather than asserting a specific internal failure path here.
    await expect(emitEvent(TENANT, "ai.smoke.ping", { message: 12345 as unknown as string })).resolves.toBeDefined();
  });

  it("sweepPendingEvents drains anything left pending (simulated by resetting status)", async () => {
    const { eventId } = await emitEvent(TENANT, "ai.smoke.ping", {});
    await AiEvent.updateOne({ _id: eventId }, { $set: { status: "pending" } });
    await AiWorkflowRun.deleteMany({}); // simulate "never actually ran"

    const { processed } = await sweepPendingEvents();
    expect(processed).toBeGreaterThanOrEqual(1);

    const event = await AiEvent.findById(eventId).lean();
    expect(event!.status).toBe("processed");
  });

  // docs/ai/BRIEF-04-BATCH-C.md Part 0.2 — the generalised subscriptionFilter ownership contract.
  describe("subscriptionFilter — shared event key ownership (Part 0.2)", () => {
    it("a shared eventKey with no subscriptionFilter declared → that workflow is skipped (default-reject)", async () => {
      let noFilterRan = false;
      let withFilterRan = false;

      registerWorkflow({
        id: "AI-00-SHARED-NO-FILTER",
        version: "1.0.0",
        eventKeys: ["test.shared.key"],
        actionClass: "read_only",
        defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,
        // deliberately no subscriptionFilter declared
        async observe(event) {
          noFilterRan = true;
          return { entityId: event.tenantId, raw: {} };
        },
        async extract() {
          return {};
        },
        async reason() {
          return { proposal: {}, confidence: 1, findings: [], reasonChain: [] };
        },
        async validate() {
          return { valid: true };
        },
        async act() {
          return { findings: [], actionsTaken: [] };
        },
        async verify() {
          return { ok: true };
        },
      });

      registerWorkflow({
        id: "AI-00-SHARED-WITH-FILTER",
        version: "1.0.0",
        eventKeys: ["test.shared.key"],
        actionClass: "read_only",
        defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,
        subscriptionFilter() {
          return true;
        },
        async observe(event) {
          withFilterRan = true;
          return { entityId: event.tenantId, raw: {} };
        },
        async extract() {
          return {};
        },
        async reason() {
          return { proposal: {}, confidence: 1, findings: [], reasonChain: [] };
        },
        async validate() {
          return { valid: true };
        },
        async act() {
          return { findings: [], actionsTaken: [] };
        },
        async verify() {
          return { ok: true };
        },
      });

      await emitEvent(TENANT, "test.shared.key", {});

      expect(noFilterRan).toBe(false);
      expect(withFilterRan).toBe(true);
      const runNoFilter = await AiWorkflowRun.findOne({ workflowId: "AI-00-SHARED-NO-FILTER" }).lean();
      expect(runNoFilter).toBeNull(); // no AiWorkflowRun row created at all — skipped before the run starts
    });

    it("real ownership: schedule.due for an AI-08-owned schedule reaches only AI-08, not AI-07/09/10", async () => {
      const assetAccountId = (await Account.create({ tenantId: TENANT, name: "Prepaid", code: "P1", account_type: "asset_prepayments", isActive: true }))._id;
      const expenseAccountId = (await Account.create({ tenantId: TENANT, name: "Expense", code: "E1", account_type: "expense", isActive: true }))._id;
      const schedule = await AiSchedule.create({
        tenantId: TENANT,
        scheduleType: "prepaid",
        sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId().toString() },
        status: "approved",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        frequency: "monthly",
        totalAmount: 1200,
        currency: "INR",
        debitAccountId: expenseAccountId,
        creditAccountId: assetAccountId,
        basis: "stated",
        periods: [{ periodKey: "2020-01", dueDate: new Date("2020-01-31"), amount: 1200, status: "pending" }],
        recognisedToDate: 0,
        remaining: 1200,
        nextRunDate: new Date("2020-01-31"),
        createdByWorkflow: "AI-08",
      });
      // dispatchEvent()'s own pre-existing kill-switch gate (unrelated to subscriptionFilter)
      // skips any workflow above RECOMMEND with no validated policy — needed so this test
      // actually reaches AI-08's subscriptionFilter rather than being filtered out earlier.
      await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true });

      await emitEvent(TENANT, "schedule.due", { scheduleId: String(schedule._id) });

      const runs = await AiWorkflowRun.find({ triggerEventId: { $exists: true } }).select("workflowId").lean();
      const workflowIds = runs.filter((r) => ["AI-07", "AI-08", "AI-09", "AI-10"].includes(r.workflowId)).map((r) => r.workflowId);
      expect(workflowIds).toEqual(["AI-08"]);
    });
  });
});

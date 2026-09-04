import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai_executor";

import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiLearningRecord from "@/models/ai/AiLearningRecord";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let replay: typeof import("@/lib/aiRuntime/runtime/executor").replay;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let aiSmokeWorkflow: typeof import("@/lib/aiRuntime/workflows/ai-00-smoke").aiSmokeWorkflow;
let registerWorkflow: typeof import("@/lib/aiRuntime/runtime/registry").registerWorkflow;

const TENANT = "executor-tenant";

describe("runWorkflow — the 10-stage executor (AI-00-SMOKE)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiWorkflowRun.init();
    await AiDecisionTrace.init();
    await AiEvent.init();
    await AiLearningRecord.init();

    ({ runWorkflow, replay } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ aiSmokeWorkflow } = await import("@/lib/aiRuntime/workflows/ai-00-smoke"));
    ({ registerWorkflow } = await import("@/lib/aiRuntime/runtime/registry"));

    bootstrapAiRuntime();
    registerWorkflow(aiSmokeWorkflow); // idempotent — bootstrap may already have done this
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiWorkflowRun.deleteMany({});
    await AiDecisionTrace.deleteMany({});
    await AiEvent.deleteMany({});
    await AiLearningRecord.deleteMany({});
  });

  it("runs all 10 stages end-to-end and produces a valid Part 2.9 envelope", async () => {
    const event = await AiEvent.create({
      tenantId: TENANT,
      eventKey: "ai.smoke.ping",
      payload: { message: "hello" },
    });

    const envelope = await runWorkflow(aiSmokeWorkflow, {
      id: String(event._id),
      tenantId: TENANT,
      eventKey: "ai.smoke.ping",
      payload: { message: "hello" },
    });

    // Contract shape (Part 2.9) — field by field.
    expect(typeof envelope.runId).toBe("string");
    expect(envelope.workflowId).toBe("AI-00-SMOKE");
    expect(envelope.workflowVersion).toBe("1.0.0");
    expect(envelope.entityId).toBe(TENANT);
    expect(["completed", "escalated", "failed", "no_action"]).toContain(envelope.status);
    expect(envelope.autonomyApplied).toBe("observe");
    expect(typeof envelope.summary).toBe("string");
    expect(Array.isArray(envelope.findings)).toBe(true);
    expect(envelope.findings[0].title).toBe("AI runtime smoke test");
    expect(envelope.metrics).toMatchObject({ scanned: 1, matched: 0, exceptions: 0, autoActioned: 0 });
    expect(envelope.status).toBe("no_action");
  });

  it("writes a complete AiDecisionTrace for the run", async () => {
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "ai.smoke.ping", payload: {} });
    const envelope = await runWorkflow(aiSmokeWorkflow, {
      id: String(event._id),
      tenantId: TENANT,
      eventKey: "ai.smoke.ping",
      payload: {},
    });

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace).not.toBeNull();
    expect(trace!.workflowId).toBe("AI-00-SMOKE");
    expect(trace!.inputsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(trace!.toolCalls.length).toBeGreaterThan(0);
    expect(trace!.toolCalls[0].tool).toBe("check_permission");
    expect(trace!.finalizedAt).not.toBeUndefined();
    expect(trace!.reasonChain.length).toBeGreaterThan(0);
  });

  it("records a learning-loop proposal for the run", async () => {
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "ai.smoke.ping", payload: {} });
    const envelope = await runWorkflow(aiSmokeWorkflow, {
      id: String(event._id),
      tenantId: TENANT,
      eventKey: "ai.smoke.ping",
      payload: {},
    });

    const record = await AiLearningRecord.findOne({ runId: envelope.runId }).lean();
    expect(record).not.toBeNull();
    expect(record!.outcome).toBe("pending");
    expect(record!.proposal).toMatchObject({ finding: "smoke test ok" });
  });

  it("idempotency: running the same trigger event twice produces exactly one run", async () => {
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "ai.smoke.ping", payload: {} });
    const triggerEvent = {
      id: String(event._id),
      tenantId: TENANT,
      eventKey: "ai.smoke.ping",
      payload: {},
    };

    const first = await runWorkflow(aiSmokeWorkflow, triggerEvent);
    const second = await runWorkflow(aiSmokeWorkflow, triggerEvent);

    expect(second.runId).toBe(first.runId);
    const count = await AiWorkflowRun.countDocuments({ workflowId: "AI-00-SMOKE", triggerEventId: event._id });
    expect(count).toBe(1);
  });

  it("replay(runId) is safe and produces no duplicate side effects", async () => {
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "ai.smoke.ping", payload: {} });
    const original = await runWorkflow(aiSmokeWorkflow, {
      id: String(event._id),
      tenantId: TENANT,
      eventKey: "ai.smoke.ping",
      payload: {},
    });

    const replayed = await replay(original.runId);

    expect(replayed.runId).toBe(original.runId);
    const runCount = await AiWorkflowRun.countDocuments({ workflowId: "AI-00-SMOKE" });
    expect(runCount).toBe(1);
    const traceCount = await AiDecisionTrace.countDocuments({ runId: original.runId });
    expect(traceCount).toBe(1);
  });

  it("a workflow with no registered trigger event (direct invocation) still runs and audits fully", async () => {
    const envelope = await runWorkflow(aiSmokeWorkflow, {
      tenantId: TENANT,
      eventKey: "ai.smoke.ping",
      payload: { message: "direct" },
    });
    expect(envelope.status).toBe("no_action");
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace).not.toBeNull();
  });

  it("regression: two separate direct invocations (both with no trigger event id) do not collide on the sparse unique index", async () => {
    // event.id absent must be genuinely OMITTED from the AiWorkflowRun document, not stored
    // as an explicit null — a sparse unique index only skips truly-absent fields.
    const first = await runWorkflow(aiSmokeWorkflow, { tenantId: TENANT, eventKey: "ai.smoke.ping", payload: { message: "a" } });
    const second = await runWorkflow(aiSmokeWorkflow, { tenantId: TENANT, eventKey: "ai.smoke.ping", payload: { message: "b" } });
    expect(first.runId).not.toBe(second.runId);
  });
});

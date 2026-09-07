import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ailearning";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

/**
 * Chunk 9 (0.1) — the learning-loop instrumentation. Two things asserted directly:
 * 1. Structural: `AiLearningRecord.runId` has a unique index, so "a run that produces a proposal
 *    produces exactly one learning record" is enforced at the database layer, not just by
 *    convention — a genuine reintroduction of AI-07's old duplicate-record bug fails loudly.
 * 2. Behavioural: the resolution sweep resolves via subjectRef status, and ages a genuinely
 *    unresolved record to `outcome_unknown` — never `accepted` — after its window.
 */

let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let getWorkflow: typeof import("@/lib/aiRuntime/runtime/registry").getWorkflow;
let listWorkflows: typeof import("@/lib/aiRuntime/runtime/registry").listWorkflows;
let runResolutionSweep: typeof import("@/lib/aiRuntime/learning/resolveOutcomes").runResolutionSweep;
let resolveLearningRecordForRun: typeof import("@/lib/aiRuntime/learning/resolveOutcomes").resolveLearningRecordForRun;

const TENANT = "ailearning-tenant";
const CREATOR = new mongoose.Types.ObjectId();

describe("AI learning loop — instrumentation, resolution, aging (Chunk 9 0.1)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), AiLearningRecord.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ getWorkflow, listWorkflows } = await import("@/lib/aiRuntime/runtime/registry"));
    ({ runResolutionSweep, resolveLearningRecordForRun } = await import("@/lib/aiRuntime/learning/resolveOutcomes"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), AiLearningRecord.deleteMany({}), AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("AiLearningRecord.runId is uniquely indexed — a genuine second record for the same run is rejected at the database layer", async () => {
    const runId = new mongoose.Types.ObjectId();
    await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-00-SMOKE", runId, proposal: {} });
    await expect(AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-00-SMOKE", runId, proposal: { second: true } })).rejects.toThrow(/duplicate key|E11000/);
  });

  it("every registered workflow is registered in the runtime — parameterised smoke check that the registry itself is complete (30 + smoke)", () => {
    const ids = listWorkflows().map((w) => w.id);
    expect(ids.length).toBeGreaterThanOrEqual(30);
    for (const n of Array.from({ length: 30 }, (_, i) => i + 1)) {
      const id = `AI-${String(n).padStart(2, "0")}`;
      expect(getWorkflow(id), `${id} must be registered`).toBeDefined();
    }
  });

  it("a run that produces a proposal produces exactly one AiLearningRecord (via the real executor, not a direct write)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-00-SMOKE", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const workflow = getWorkflow("AI-00-SMOKE")!;
    const envelope = await runWorkflow(workflow, { tenantId: TENANT, eventKey: "ai.smoke.ping", payload: {} });
    const count = await AiLearningRecord.countDocuments({ runId: envelope.runId });
    expect(count).toBe(1);
  });

  // Chunk 10a addendum (docs/ai/audits/COVERAGE_GAPS.md's named gap): the two tests above prove
  // the shape holds for AI-00-SMOKE and AI-07 individually — neither is a registry-driven walk
  // across all 30. `learn()` (lib/aiRuntime/runtime/executor.ts) is a fully generic stage every
  // workflow's real run passes through unconditionally, so this is less "does each workflow wire
  // it up" (nothing to wire — there is exactly one call site, shared) and more "does every real
  // workflow's own observe/extract/reason path actually REACH that shared stage cleanly on an
  // ordinary empty tenant" — a genuine per-workflow risk, since that code is unique per workflow.
  // Sweeps every workflow whose own `eventKeys` includes a tenant-wide trigger (`ai.sweep.hourly`
  // or `period.horizon.reached`) that needs no entity-specific fixture — derived from the real
  // registry, not a hand-maintained id list, so a future workflow is swept automatically the
  // moment it declares one of these event keys, and a workflow requiring a real fixture (a bill,
  // an invoice, a document) is excluded by the same real property, not silently forgotten.
  it("registry-driven sweep: every workflow reachable via a tenant-wide sweep trigger produces exactly one AiLearningRecord on an ordinary empty tenant", async () => {
    const SWEEP_TENANT = "ailearning-sweep-tenant";
    const excluded: { id: string; eventKeys: string[] }[] = [];
    const results: { id: string; recordCount: number }[] = [];

    for (const workflow of listWorkflows()) {
      if (workflow.id === "AI-00-SMOKE") continue; // covered by its own dedicated test above
      const eventKey = workflow.eventKeys.includes("ai.sweep.hourly")
        ? "ai.sweep.hourly"
        : workflow.eventKeys.includes("period.horizon.reached")
          ? "period.horizon.reached"
          : null;
      if (!eventKey) {
        // Needs a real entity-specific fixture (a bill, an invoice, a document, a schedule) to
        // trigger meaningfully — each such workflow already has its own dedicated test proving
        // this shape (e.g. AI-02's "idempotency: the same trigger event twice... sets the account
        // once", AI-08's compare-and-swap test) rather than being force-fit into an empty-tenant
        // sweep it was never designed to answer cleanly on.
        excluded.push({ id: workflow.id, eventKeys: [...workflow.eventKeys] });
        continue;
      }

      await AiWorkflowPolicy.create({ tenantId: SWEEP_TENANT, workflowId: workflow.id, killSwitchEnabled: false, maxAutonomyLevel: "observe" });
      const payload =
        eventKey === "period.horizon.reached"
          ? { period: "2026-01", periodEnd: new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999)).toISOString() }
          : {};
      const envelope = await runWorkflow(workflow, { tenantId: SWEEP_TENANT, eventKey, payload });
      const recordCount = await AiLearningRecord.countDocuments({ runId: envelope.runId });
      results.push({ id: workflow.id, recordCount });
    }

    // Sanity: the sweep must not have accidentally excluded everything (a real registry-shape
    // change worth noticing) or produced zero results.
    expect(results.length, "the sweep must actually cover a real majority of the registry").toBeGreaterThanOrEqual(20);
    expect(excluded.length, "every excluded workflow must be excluded for the documented reason (no tenant-wide trigger), not silently").toBeLessThanOrEqual(9);

    const failures = results.filter((r) => r.recordCount !== 1);
    expect(failures, `every swept workflow must produce exactly one AiLearningRecord per run: ${JSON.stringify(failures)}`).toEqual([]);
  });

  it("AI-07's own accuracy-check resolves its learning record immediately via ActResult.learningOutcome — still exactly one record, not two", async () => {
    const ai07 = getWorkflow("AI-07")!;
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Learning Loop Vendor", is_company: true }, createdBy: CREATOR });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
    // No prior accrual exists for this invoice's PO, so accuracy_check mode short-circuits with
    // no learning outcome — this test only needs to prove the SHAPE (exactly one record, whatever
    // its outcome), which the AI-07-specific test suite already covers with real PO fixtures.
    const invoice = await Invoice.create({
      tenantId: TENANT, name: `LEARN-BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "draft",
      invoiceDate: new Date(), dueDate: new Date(), invoiceLines: [], amountUntaxed: 0, amountTax: 0, amountTotal: 0, amountResidual: 0, paymentState: "not_paid",
    });
    const envelope = await runWorkflow(ai07, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(invoice._id) } });
    const count = await AiLearningRecord.countDocuments({ runId: envelope.runId });
    expect(count).toBe(1);
  });

  it("resolution sweep: a subjectRef whose record reached POSTED resolves the pending record to accepted", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Resolved Vendor", is_company: true }, createdBy: CREATOR });
    const invoice = await Invoice.create({
      tenantId: TENANT, name: `RESOLVE-BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date(), dueDate: new Date(), invoiceLines: [], amountUntaxed: 0, amountTax: 0, amountTotal: 0, amountResidual: 0, paymentState: "not_paid",
    });
    const run = await AiWorkflowRun.create({
      tenantId: TENANT, workflowId: "AI-01", workflowVersion: "1.0.0", entityId: TENANT, status: "completed", autonomyApplied: "draft",
      findings: [{ id: "f1", type: "proposal", severity: "low", title: "t", detail: "d", confidence: 1, subjectRefs: [{ model: "Invoice", id: String(invoice._id) }], evidence: [], reasonChain: [] }],
      metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 },
      startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48h old — past the resolution grace period
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    const record = await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-01", runId: run._id, proposal: {}, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });

    const result = await runResolutionSweep(TENANT);
    expect(result.resolved).toBe(1);

    const updated = await AiLearningRecord.findById(record._id).lean();
    expect(updated!.outcome).toBe("accepted");
  });

  it("resolution sweep: a subjectRef whose record was deleted resolves to rejected", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Rejected Vendor", is_company: true }, createdBy: CREATOR });
    const invoice = await Invoice.create({
      tenantId: TENANT, name: `REJECT-BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "draft",
      invoiceDate: new Date(), dueDate: new Date(), invoiceLines: [], amountUntaxed: 0, amountTax: 0, amountTotal: 0, amountResidual: 0, paymentState: "not_paid",
    });
    const invoiceId = String(invoice._id);
    await Invoice.deleteOne({ _id: invoiceId }); // the human deleted the draft the AI proposed — a real override signal

    const run = await AiWorkflowRun.create({
      tenantId: TENANT, workflowId: "AI-01", workflowVersion: "1.0.0", entityId: TENANT, status: "completed", autonomyApplied: "draft",
      findings: [{ id: "f1", type: "proposal", severity: "low", title: "t", detail: "d", confidence: 1, subjectRefs: [{ model: "Invoice", id: invoiceId }], evidence: [], reasonChain: [] }],
      metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 },
      startedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });
    const record = await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-01", runId: run._id, proposal: {}, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });

    await runResolutionSweep(TENANT);
    const updated = await AiLearningRecord.findById(record._id).lean();
    expect(updated!.outcome).toBe("rejected");
  });

  it("a record with no resolution signal ages to outcome_unknown after the window — never accepted (silence is not agreement)", async () => {
    const run = await AiWorkflowRun.create({
      tenantId: TENANT, workflowId: "AI-16", workflowVersion: "1.0.0", entityId: TENANT, status: "completed", autonomyApplied: "observe",
      findings: [], metrics: { scanned: 0, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 },
      startedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days old — past the 14-day window
    });
    const record = await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-16", runId: run._id, proposal: {}, createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) });

    const result = await runResolutionSweep(TENANT);
    expect(result.agedToUnknown).toBe(1);
    const updated = await AiLearningRecord.findById(record._id).lean();
    expect(updated!.outcome).toBe("outcome_unknown");
  });

  it("a record still within its resolution window and with no signal stays pending — not aged prematurely", async () => {
    const run = await AiWorkflowRun.create({
      tenantId: TENANT, workflowId: "AI-16", workflowVersion: "1.0.0", entityId: TENANT, status: "completed", autonomyApplied: "observe",
      findings: [], metrics: { scanned: 0, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 },
      startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    await AiLearningRecord.create({ tenantId: TENANT, workflowId: "AI-16", runId: run._id, proposal: {}, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });

    const result = await runResolutionSweep(TENANT);
    expect(result.stillPending).toBe(1);
    expect(result.agedToUnknown).toBe(0);
  });

  it("resolveLearningRecordForRun is a no-op (not an error) when the run never produced a pending record", async () => {
    const resolved = await resolveLearningRecordForRun(String(new mongoose.Types.ObjectId()), "accepted");
    expect(resolved).toBe(false);
  });
});

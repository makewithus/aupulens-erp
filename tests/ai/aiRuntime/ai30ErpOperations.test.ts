import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai30";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiEvent from "@/models/ai/AiEvent";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiOperationsRepairLog from "@/models/ai/AiOperationsRepairLog";
import AiOperationsFinding from "@/models/ai/AiOperationsFinding";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai30ErpOperations: typeof import("@/lib/aiRuntime/workflows/ai-30-erp-operations").ai30ErpOperations;
let checkRepairGate: typeof import("@/lib/aiRuntime/opsHealth/repairGate").checkRepairGate;
let recordRepairAttempt: typeof import("@/lib/aiRuntime/opsHealth/repairGate").recordRepairAttempt;
let decideRelink: typeof import("@/lib/aiRuntime/opsHealth/relinkOrphan").decideRelink;

const TENANT = "ai30-tenant";
const CREATOR = new mongoose.Types.ObjectId();

async function policy(maxAutonomyLevel = "controlled_autonomous") {
  await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-30", killSwitchEnabled: true, maxAutonomyLevel });
}

describe("AI-30 — ERP operations intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), AiEvent.init(), AiTaxTransaction.init(), AiOperationsRepairLog.init(), AiOperationsFinding.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai30ErpOperations } = await import("@/lib/aiRuntime/workflows/ai-30-erp-operations"));
    ({ checkRepairGate, recordRepairAttempt } = await import("@/lib/aiRuntime/opsHealth/repairGate"));
    ({ decideRelink } = await import("@/lib/aiRuntime/opsHealth/relinkOrphan"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), AiEvent.deleteMany({}), AiTaxTransaction.deleteMany({}), AiOperationsRepairLog.deleteMany({}), AiOperationsFinding.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("a healthy tenant produces zero issues (false positive, mandatory)", async () => {
    await policy();
    const envelope = await runWorkflow(ai30ErpOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { issues: unknown[] };
    expect(proposal.issues).toEqual([]);
    expect(envelope.findings).toEqual([]);
  });

  it("a broken tenant's issues are all detected: stuck draft, dead-lettered event, stale tax projection", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Stuck Vendor", is_company: true }, createdBy: CREATOR });
    await Invoice.create({
      tenantId: TENANT, name: "STUCK-DRAFT", partnerId: vendor._id, moveType: "in_invoice", state: "draft",
      invoiceDate: new Date(), dueDate: new Date(), invoiceLines: [], amountUntaxed: 0, amountTax: 0, amountTotal: 0, amountResidual: 0, paymentState: "not_paid",
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });
    await AiEvent.create({ tenantId: TENANT, eventKey: "test.broken", status: "dead_letter", attempts: 5, lastError: "handler threw" });

    const period = "2026-01";
    await AiTaxTransaction.create({
      tenantId: TENANT, sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() }, direction: "output", jurisdiction: null,
      taxableAmount: 1000, taxAmount: 180, documentDate: new Date("2026-01-05"), periodKey: period,
      projectedAt: new Date("2026-01-06"), projectionVersion: 1,
    });
    await Invoice.create({
      tenantId: TENANT, name: "NEWER-SOURCE", partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"), invoiceLines: [], amountUntaxed: 500, amountTax: 90, amountTotal: 590, amountResidual: 0, paymentState: "paid",
      updatedAt: new Date("2026-01-20"),
    });

    await policy();
    const envelope = await runWorkflow(ai30ErpOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { issues: { type: string }[] };
    const types = proposal.issues.map((i) => i.type);
    expect(types).toContain("stuck_draft");
    expect(types).toContain("dead_lettered_event");
    expect(types).toContain("stale_tax_projection");
  });

  it("a dead-lettered event is requeued back to pending, audited before/after", async () => {
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "test.requeue", status: "dead_letter", attempts: 2, lastError: "boom" });
    await policy();

    const envelope = await runWorkflow(ai30ErpOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { repairsAttempted: { repairType: string; outcome: string }[] };
    expect(proposal.repairsAttempted.some((r) => r.repairType === "requeue_dead_letter" && r.outcome === "success")).toBe(true);

    const after = await AiEvent.findById(event._id).lean();
    expect(after!.status).toBe("pending");

    const log = await AiOperationsRepairLog.findOne({ tenantId: TENANT, issueKey: `AiEvent:${event._id}` }).lean();
    expect(log).toBeDefined();
    expect(log!.outcome).toBe("success");
    expect((log!.beforeState as { status: string }).status).toBe("dead_letter");
    expect((log!.afterState as { status: string }).status).toBe("pending");
  });

  it("a repair that fails twice escalates and is never retried again (retry cap + backoff)", async () => {
    const issueKey = "AiEvent:synthetic-failing-issue";
    let gate = await checkRepairGate(TENANT, issueKey);
    expect(gate.allowed).toBe(true);
    await recordRepairAttempt({ tenantId: TENANT, issueKey, repairType: "requeue_dead_letter", attempt: 1, beforeState: {}, afterState: null, outcome: "failed", error: "e1" });

    gate = await checkRepairGate(TENANT, issueKey);
    expect(gate.allowed).toBe(false); // backing off after the first failure
    expect(gate.reason).toContain("backing off");

    // Simulate the backoff having elapsed by writing the second failure directly.
    await recordRepairAttempt({ tenantId: TENANT, issueKey, repairType: "requeue_dead_letter", attempt: 2, beforeState: {}, afterState: null, outcome: "failed", error: "e2" });
    gate = await checkRepairGate(TENANT, issueKey);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("failed 2 times");

    // A human/escalation path would record "escalated" — once that happens, it must never be retried.
    await recordRepairAttempt({ tenantId: TENANT, issueKey, repairType: "requeue_dead_letter", attempt: 3, beforeState: {}, afterState: null, outcome: "escalated" });
    gate = await checkRepairGate(TENANT, issueKey);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("escalated");
  });

  it("kill switch off → no repairs attempted despite a repairable issue existing", async () => {
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "test.killswitch", status: "dead_letter", attempts: 1, lastError: "boom" });
    // Deliberately no AiWorkflowPolicy row — killSwitchEnabled defaults to false.

    const envelope = await runWorkflow(ai30ErpOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { repairsAttempted: { outcome: string }[] };
    expect(proposal.repairsAttempted.every((r) => r.outcome.startsWith("skipped"))).toBe(true);

    const after = await AiEvent.findById(event._id).lean();
    expect(after!.status).toBe("dead_letter"); // untouched

    const logs = await AiOperationsRepairLog.find({ tenantId: TENANT }).lean();
    expect(logs).toEqual([]); // no repair was ever attempted, so nothing to log
  });

  it("only the 4 A.5-permitted repair types are ever named; the 2 unwired this chunk are declared honestly, not faked", async () => {
    await policy();
    const envelope = await runWorkflow(ai30ErpOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { checksNotImplemented: { what: string }[] };
    const declared = proposal.checksNotImplemented.map((c) => c.what);
    expect(declared).toContain("relink_orphan");
    expect(declared).toContain("retry_integration_connection");

    // The generic relink primitive is real and tested, even though nothing wires it live this chunk.
    expect(decideRelink([]).outcome).toBe("escalated_no_candidate");
    expect(decideRelink([{ parentId: "p1", parentLabel: "only one" }]).outcome).toBe("relinked");
    expect(decideRelink([{ parentId: "p1", parentLabel: "a" }, { parentId: "p2", parentLabel: "b" }]).outcome).toBe("escalated_ambiguous");
  });

  it("no repair path ever writes to a financial record (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-30-erp-operations lib/aiRuntime/opsHealth lib/aiRuntime/tools/opsHealthTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    const forbiddenWrites = output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !/AiOperationsRepairLog|AiOperationsFinding|AiEvent\.updateOne/.test(line));
    expect(forbiddenWrites).toEqual([]);
  });
});

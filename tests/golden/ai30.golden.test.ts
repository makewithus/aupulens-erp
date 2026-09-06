import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai30golden";

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
import { AI30_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type Ai30GoldenCase } from "@/tests/golden/ai30/goldenCases";

/**
 * The golden-dataset CI check for AI-30 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Unlike a normal test
 * (proves the code does what it did yesterday), this reports a PASS RATE across a named case set
 * and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a behaviour change
 * altered real decisions, which a per-assertion test can miss if it only checks the cases it
 * happens to include.
 */

// AI-30's detectors and its two live repair types are deterministic Mongo queries and simple
// state transitions (confirmed by reading lib/aiRuntime/opsHealth/detect.ts and the source-grep
// test in tests/ai/aiRuntime/ai30ErpOperations.test.ts asserting no LLM/financial-write path
// exists anywhere in this workflow), so 100% is the only honest bar.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai30ErpOperations: typeof import("@/lib/aiRuntime/workflows/ai-30-erp-operations").ai30ErpOperations;

async function policy(tenantId: string) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-30", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous" });
}

async function seedAndRun(tenantId: string, goldenCase: Ai30GoldenCase) {
  await policy(tenantId);

  if (goldenCase.scenario === "broken_multi_issue") {
    const vendor = await Customer.create({ tenantId, header: { name: "Golden Stuck Vendor", is_company: true }, createdBy: GOLDEN_CREATOR });
    await Invoice.create({
      tenantId, name: "GOLDEN-STUCK-DRAFT", partnerId: vendor._id, moveType: "in_invoice", state: "draft",
      invoiceDate: new Date(), dueDate: new Date(), invoiceLines: [], amountUntaxed: 0, amountTax: 0, amountTotal: 0, amountResidual: 0, paymentState: "not_paid",
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });
    await AiEvent.create({ tenantId, eventKey: "golden.broken", status: "dead_letter", attempts: 5, lastError: "handler threw" });

    const period = "2026-01";
    await AiTaxTransaction.create({
      tenantId, sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() }, direction: "output", jurisdiction: null,
      taxableAmount: 1000, taxAmount: 180, documentDate: new Date("2026-01-05"), periodKey: period,
      projectedAt: new Date("2026-01-06"), projectionVersion: 1,
    });
    await Invoice.create({
      tenantId, name: "GOLDEN-NEWER-SOURCE", partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"), invoiceLines: [], amountUntaxed: 500, amountTax: 90, amountTotal: 590, amountResidual: 0, paymentState: "paid",
      updatedAt: new Date("2026-01-20"),
    });

    const envelope = await runWorkflow(ai30ErpOperations, { tenantId, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { issues: { type: string }[] };
    return { issueTypes: [...new Set(proposal.issues.map((i) => i.type))].sort() };
  }

  if (goldenCase.scenario === "dead_letter_repair_success") {
    const event = await AiEvent.create({ tenantId, eventKey: "golden.requeue", status: "dead_letter", attempts: 2, lastError: "boom" });
    const envelope = await runWorkflow(ai30ErpOperations, { tenantId, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { repairsAttempted: { repairType: string; outcome: string }[] };
    const after = await AiEvent.findById(event._id).lean();
    return {
      eventStatusAfter: after!.status as "pending",
      repairOutcome: (proposal.repairsAttempted.find((r) => r.repairType === "requeue_dead_letter")?.outcome ?? "missing") as "success",
    };
  }

  // healthy
  const envelope = await runWorkflow(ai30ErpOperations, { tenantId, eventKey: "ai.sweep.hourly", payload: {} });
  const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
  const proposal = trace!.rawProposal as unknown as { issues: unknown[] };
  return { issueCount: proposal.issues.length };
}

describe("AI-30 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), AiEvent.init(), AiTaxTransaction.init(), AiOperationsRepairLog.init(), AiOperationsFinding.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai30ErpOperations } = await import("@/lib/aiRuntime/workflows/ai-30-erp-operations"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI30_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI30_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const passed = JSON.stringify(actual) === JSON.stringify(goldenCase.expected);
      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-30 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

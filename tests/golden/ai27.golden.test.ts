import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai27golden";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiHold from "@/models/ai/AiHold";
import AiDuplicateFinding from "@/models/ai/AiDuplicateFinding";
import { AI27_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type GoldenCase } from "@/tests/golden/ai27/goldenCases";

/**
 * The golden-dataset CI check for AI-27 (docs/ai/BRIEF-08b-FINAL.md C.2). Unlike a normal test
 * (proves the code does what it did yesterday), this reports a PASS RATE across a named case set
 * and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a model/prompt/
 * scoring-threshold change altered real behaviour, which a per-assertion test can miss if it only
 * checks the cases it happens to include.
 */

const PASS_RATE_THRESHOLD = 1.0; // every golden case must pass — AI-27's scoring is deterministic, not model-assisted

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai27DuplicateDetection: typeof import("@/lib/aiRuntime/workflows/ai-27-duplicate-detection").ai27DuplicateDetection;

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const vendorIds = new Map<string, mongoose.Types.ObjectId>();
  for (const bill of goldenCase.bills) {
    if (!vendorIds.has(bill.vendorName)) {
      const v = await Customer.create({ tenantId, header: { name: bill.vendorName, is_company: true }, createdBy: GOLDEN_CREATOR });
      vendorIds.set(bill.vendorName, v._id as mongoose.Types.ObjectId);
    }
    await Invoice.create({
      tenantId,
      name: `GOLDEN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      partnerId: vendorIds.get(bill.vendorName),
      moveType: "in_invoice",
      state: "posted",
      invoiceDate: new Date(bill.date),
      dueDate: new Date(bill.date),
      sourceDocument: bill.sourceDocument,
      poReference: bill.poReference,
      invoiceLines: [{ name: "Goods", priceSubtotal: bill.amount, quantity: 1, priceUnit: bill.amount }],
      amountUntaxed: bill.amount,
      amountTax: 0,
      amountTotal: bill.amount,
      amountResidual: bill.amount,
      paymentState: "not_paid",
    });
  }
}

describe("AI-27 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiHold.init(), AiDuplicateFinding.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai27DuplicateDetection } = await import("@/lib/aiRuntime/workflows/ai-27-duplicate-detection"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI27_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: number; actual: number }[] = [];

    for (const goldenCase of AI27_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);
      await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-27", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

      const envelope = await runWorkflow(ai27DuplicateDetection, { tenantId, eventKey: "bill.created", payload: {} });
      const actual = envelope.findings.filter((f) => f.title.includes("duplicate bill")).length;
      results.push({ id: goldenCase.id, passed: actual === goldenCase.expected.duplicateFindingCount, expected: goldenCase.expected.duplicateFindingCount, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-27 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

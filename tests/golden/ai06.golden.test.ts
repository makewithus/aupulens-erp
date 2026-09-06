import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai06golden";

import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiPaymentRunProposal from "@/models/ai/AiPaymentRunProposal";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import { AI06_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type Ai06GoldenCase } from "@/tests/golden/ai06/goldenCases";

/**
 * The golden-dataset CI check for AI-06 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Unlike a normal test
 * (proves the code does what it did yesterday), this reports a PASS RATE across a named case set
 * and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a behaviour change
 * altered real decisions, which a per-assertion test can miss if it only checks the cases it
 * happens to include.
 */

// AI-06's bill_match verdict is deterministic tolerance arithmetic plus a straight vendor-identity
// equality check (confirmed by reading computeLineVariances()/the vendor check in index.ts — no
// LLM call anywhere in this workflow), so 100% is the only honest bar.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai06PayablesOperations: typeof import("@/lib/aiRuntime/workflows/ai-06-payables-operations").ai06PayablesOperations;

async function seedAndRun(tenantId: string, goldenCase: Ai06GoldenCase) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-06", killSwitchEnabled: true, maxAutonomyLevel: "draft" });
  const realVendor = await Customer.create({ tenantId, header: { name: "Golden Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });

  let poName: string | undefined;
  let productId = new mongoose.Types.ObjectId();
  if (goldenCase.poVendor !== "none" && goldenCase.poLine) {
    const poOwner = goldenCase.poVendor === "same" ? realVendor : await Customer.create({ tenantId, header: { name: "Golden Impersonating Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const po = await PurchaseOrder.create({
      tenantId,
      name: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      partnerId: poOwner._id,
      createdBy: new mongoose.Types.ObjectId(),
      orderLines: [{
        productId,
        name: "Widget",
        productQty: goldenCase.poLine.productQty,
        receivedQty: goldenCase.poLine.receivedQty,
        billedQty: 0,
        priceUnit: goldenCase.poLine.priceUnit,
        priceSubtotal: goldenCase.poLine.productQty * goldenCase.poLine.priceUnit,
      }],
    });
    poName = po.name;
  }

  const billAmount = goldenCase.billLine.quantity * goldenCase.billLine.priceUnit;
  const bill = await Invoice.create({
    tenantId,
    name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: realVendor._id,
    moveType: "in_invoice",
    state: "posted",
    poReference: poName,
    poMatchType: goldenCase.poMatchType ?? "2_way",
    poMatchStatus: "pending",
    invoiceLines: [{ productId, name: "Widget", quantity: goldenCase.billLine.quantity, priceUnit: goldenCase.billLine.priceUnit, priceSubtotal: billAmount, taxIds: [] }],
    amountTotal: billAmount,
    dueDate: new Date(),
  });

  const envelope = await runWorkflow(ai06PayablesOperations, { tenantId, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });
  const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
  const proposal = trace!.rawProposal as unknown as { matchResult: { verdict: string; variances: string[] } };

  return {
    verdict: proposal.matchResult.verdict as Ai06GoldenCase["expected"]["verdict"],
    exceptionFindingCount: envelope.findings.filter((f) => f.title.startsWith("PO match exception")).length,
    variances: proposal.matchResult.variances,
  };
}

describe("AI-06 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Invoice.init(), PurchaseOrder.init(), Customer.init(), User.init(), AiMaterialityPolicy.init(),
      AiPaymentRunProposal.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(),
      AiToolCall.init(), AiWorkflowPolicy.init(), AiAttentionItem.init(), ExtractedDocument.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai06PayablesOperations } = await import("@/lib/aiRuntime/workflows/ai-06-payables-operations"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI06_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI06_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const passed =
        actual.verdict === goldenCase.expected.verdict &&
        actual.exceptionFindingCount === goldenCase.expected.exceptionFindingCount &&
        (goldenCase.expected.varianceContains === undefined || actual.variances.some((v) => v.includes(goldenCase.expected.varianceContains!)));
      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-06 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

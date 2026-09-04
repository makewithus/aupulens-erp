import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai07golden";

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI07_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type Ai07GoldenCase } from "@/tests/golden/ai07/goldenCases";

/**
 * The golden-dataset CI check for AI-07 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * behaviour change altered outcomes, which a per-assertion test can miss if it only checks the
 * cases it happens to include.
 */

// AI-07 is fully deterministic (PurchaseOrder receivedQty/billedQty comparison — no LLM call
// anywhere in the workflow, per its own module doc comment), so 100% is the only honest bar —
// same reasoning as AI-27's golden dataset.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai07AccrualIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-07-accrual-intelligence").ai07AccrualIntelligence;

async function seedAndRun(tenantId: string, goldenCase: Ai07GoldenCase) {
  const expenseAccountId = await Account.create({ tenantId, name: "Expense", code: `EXP-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true, isLocked: false, status: "active" });
  const liabilityAccountId = await Account.create({ tenantId, name: "Liability", code: `LIA-${Math.random().toString(36).slice(2, 8)}`, account_type: "liability_current", isActive: true, isLocked: false, status: "active" });
  const userId = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  const vendor = await Customer.create({ tenantId, header: { name: "Golden Vendor", is_company: true }, createdBy: GOLDEN_CREATOR });

  const po = await PurchaseOrder.create({
    tenantId,
    name: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: vendor._id,
    dateOrder: new Date("2026-02-01"),
    orderLines: goldenCase.poLines.map((l, i) => ({
      productId: new mongoose.Types.ObjectId(),
      name: `Item ${i}`,
      productQty: l.productQty,
      receivedQty: l.receivedQty,
      billedQty: l.billedQty,
      priceUnit: l.priceUnit,
      taxIds: [],
      priceSubtotal: l.priceUnit * l.productQty,
    })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
    status: "approved",
    createdBy: GOLDEN_CREATOR,
  });

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
  if (goldenCase.materialityThreshold !== null) {
    await AiMaterialityPolicy.create({ tenantId, thresholds: [{ appliesTo: "accrual", absoluteAmount: goldenCase.materialityThreshold }] });
  }

  const sweepEnvelope = await runWorkflow(ai07AccrualIntelligence, { tenantId, eventKey: "ai.sweep.hourly", payload: { actingUserId: String(userId._id) } });
  const journalCountAfterSweep = await JournalEntry.countDocuments({ tenantId });

  let learningOutcome: string | undefined;
  if (goldenCase.matchingBillAmount !== undefined) {
    const bill = await Invoice.create({
      tenantId,
      name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      partnerId: vendor._id,
      moveType: "in_invoice",
      state: "draft",
      invoiceDate: new Date(),
      dueDate: new Date(),
      invoiceLines: [{ name: "Goods", priceSubtotal: goldenCase.matchingBillAmount, quantity: 1, priceUnit: goldenCase.matchingBillAmount }],
      amountTotal: goldenCase.matchingBillAmount,
    });
    await PurchaseOrder.updateOne({ _id: po._id }, { $push: { invoiceIds: bill._id } });
    await runWorkflow(ai07AccrualIntelligence, { tenantId, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });
    const record = await AiLearningRecord.findOne({ tenantId, workflowId: "AI-07", "proposal.accrualAccuracy.basis": "accrual_accuracy" }).lean();
    learningOutcome = record?.outcome;
  }

  return {
    grniFindingCount: sweepEnvelope.findings.filter((f) => f.title.includes("GRNI accrual candidate")).length,
    overBilledFindingCount: sweepEnvelope.findings.filter((f) => f.title.includes("Over-billed")).length,
    journalCountAfterSweep,
    learningOutcome,
  };
}

describe("AI-07 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), Invoice.init(), Customer.init(), User.init(), PurchaseOrder.init(), JournalEntry.init(),
      AiSchedule.init(), AiMaterialityPolicy.init(), AiLearningRecord.init(), AiWorkflowRun.init(), AiDecisionTrace.init(),
      AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai07AccrualIntelligence } = await import("@/lib/aiRuntime/workflows/ai-07-accrual-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI07_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI07_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const passed =
        actual.grniFindingCount === goldenCase.expected.grniFindingCount &&
        actual.overBilledFindingCount === goldenCase.expected.overBilledFindingCount &&
        actual.journalCountAfterSweep === goldenCase.expected.journalCountAfterSweep &&
        (goldenCase.expected.learningOutcome === undefined || actual.learningOutcome === goldenCase.expected.learningOutcome);
      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-07 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

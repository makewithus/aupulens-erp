import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai08golden";

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI08_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type Ai08GoldenCase } from "@/tests/golden/ai08/goldenCases";

/**
 * The golden-dataset CI check for AI-08 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Unlike a normal test
 * (proves the code does what it did yesterday), this reports a PASS RATE across a named case set
 * and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a behaviour change
 * altered real decisions, which a per-assertion test can miss if it only checks the cases it
 * happens to include.
 */

// AI-08's detect branch is deterministic regex/keyword matching plus straight-line amortisation
// arithmetic (confirmed by reading detectServicePeriod()/the schedule-period builder — no LLM
// call anywhere in this workflow), so 100% is the only honest bar — same reasoning as AI-10's
// golden dataset, which shares this exact structure.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai08PrepaidSchedule: typeof import("@/lib/aiRuntime/workflows/ai-08-prepaid-schedule").ai08PrepaidSchedule;

async function seedAndRun(tenantId: string, goldenCase: Ai08GoldenCase) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.9 });
  const user = await User.create({ tenantId, name: "Golden Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  await Account.create({ tenantId, name: "Prepaid Account", code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_prepayments", isActive: true });
  const partnerId = await Customer.create({ tenantId, header: { name: "Golden Vendor", is_company: true }, createdBy: user._id });

  const invoiceDate = new Date(goldenCase.invoiceDate);
  const invoice = await Invoice.create({
    tenantId,
    name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: partnerId._id,
    moveType: "in_invoice",
    state: "draft",
    invoiceDate,
    dueDate: invoiceDate,
    invoiceLines: [{ name: goldenCase.billDescription, priceSubtotal: goldenCase.billAmount, quantity: 1, priceUnit: goldenCase.billAmount }],
    amountTotal: goldenCase.billAmount,
    currencyId: goldenCase.currencyId ?? "INR",
  });

  const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId, eventKey: "bill.created", payload: { invoiceId: String(invoice._id), actingUserId: String(user._id) } });
  const schedule = await AiSchedule.findOne({ tenantId, "sourceRef.id": String(invoice._id) }).lean();
  const scheduleSum = schedule ? Math.round(schedule.periods.reduce((s, p) => s + p.amount, 0) * 100) / 100 : undefined;

  return {
    candidateFinding: envelope.findings.some((f) => f.title.includes("candidate")),
    fxUnsupportedFinding: envelope.findings.some((f) => f.title.includes("fx_unsupported")),
    scheduleCreated: Boolean(schedule),
    scheduleSum,
  };
}

describe("AI-08 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), Invoice.init(), Customer.init(), User.init(), JournalEntry.init(),
      AiSchedule.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai08PrepaidSchedule } = await import("@/lib/aiRuntime/workflows/ai-08-prepaid-schedule"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI08_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI08_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const passed =
        actual.candidateFinding === goldenCase.expected.candidateFinding &&
        actual.fxUnsupportedFinding === goldenCase.expected.fxUnsupportedFinding &&
        actual.scheduleCreated === goldenCase.expected.scheduleCreated &&
        (goldenCase.expected.scheduleSum === undefined || actual.scheduleSum === goldenCase.expected.scheduleSum);
      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-08 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

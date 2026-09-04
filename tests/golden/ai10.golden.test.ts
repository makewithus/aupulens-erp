import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai10golden";

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import Asset from "@/models/finance/Asset";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI10_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type Ai10GoldenCase } from "@/tests/golden/ai10/goldenCases";

/**
 * The golden-dataset CI check for AI-10 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * behaviour change altered outcomes, which a per-assertion test can miss if it only checks the
 * cases it happens to include.
 */

// AI-10's capital-check and schedule-init branches are fully deterministic (keyword/threshold
// matching, straight-line depreciation arithmetic — no LLM call anywhere in the workflow), so
// 100% is the only honest bar — same reasoning as AI-27's golden dataset.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai10FixedAsset: typeof import("@/lib/aiRuntime/workflows/ai-10-fixed-asset").ai10FixedAsset;

async function seedAndRun(tenantId: string, goldenCase: Ai10GoldenCase) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });
  const userId = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });

  if (goldenCase.scenario === "bill") {
    if (goldenCase.thresholdAmount !== undefined && goldenCase.thresholdAmount !== null) {
      await AiMaterialityPolicy.create({ tenantId, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: goldenCase.thresholdAmount }] });
    }
    const partnerId = await Customer.create({ tenantId, header: { name: "Golden Vendor", is_company: true }, createdBy: GOLDEN_CREATOR });
    const invoice = await Invoice.create({
      tenantId,
      name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      partnerId: partnerId._id,
      moveType: "in_invoice",
      state: "draft",
      invoiceDate: new Date("2026-02-01"),
      dueDate: new Date("2026-02-01"),
      invoiceLines: [{ name: goldenCase.billDescription, priceSubtotal: goldenCase.billAmount, quantity: 1, priceUnit: goldenCase.billAmount }],
      amountTotal: goldenCase.billAmount,
      currencyId: goldenCase.currencyId ?? "INR",
    });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId, eventKey: "bill.created", payload: { invoiceId: String(invoice._id), actingUserId: String(userId._id) } });
    const capitalFinding = envelope.findings.find((f) => f.title.includes("Capital-expenditure candidate"));
    return {
      capitalCandidateFinding: Boolean(capitalFinding),
      thresholdConfiguredInDetail: capitalFinding ? capitalFinding.detail.includes("threshold_configured=true") : undefined,
      fxUnsupportedFinding: envelope.findings.some((f) => f.title.includes("fx_unsupported")),
      scheduleCreated: undefined,
      scheduleSum: undefined,
    };
  }

  // asset_created scenario
  const assetAccountId = await Account.create({ tenantId, name: "Asset", code: `AST-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_fixed", isActive: true, isLocked: false, status: "active" });
  const depAccountId = await Account.create({ tenantId, name: "Depreciation", code: `DEP-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense_depreciation", isActive: true, isLocked: false, status: "active" });
  const asset = await Asset.create({
    tenantId,
    name: "Golden Asset",
    purchaseDate: new Date("2026-01-17"),
    originalValue: goldenCase.assetOriginalValue,
    salvageValue: 0,
    method: "linear",
    durationYears: goldenCase.assetDurationYears,
    accounts: { assetAccountId: assetAccountId._id, depreciationAccountId: depAccountId._id },
    status: "posted",
  });

  await runWorkflow(ai10FixedAsset, { tenantId, eventKey: "asset.created", payload: { assetId: String(asset._id), actingUserId: String(userId._id) } });
  const schedule = await AiSchedule.findOne({ tenantId, "sourceRef.id": String(asset._id) }).lean();
  const scheduleSum = schedule ? Math.round(schedule.periods.reduce((s, p) => s + p.amount, 0) * 100) / 100 : undefined;

  return {
    capitalCandidateFinding: false,
    thresholdConfiguredInDetail: undefined,
    fxUnsupportedFinding: false,
    scheduleCreated: Boolean(schedule),
    scheduleSum,
  };
}

describe("AI-10 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), Invoice.init(), Customer.init(), User.init(), Asset.init(), JournalEntry.init(),
      AiSchedule.init(), AiMaterialityPolicy.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai10FixedAsset } = await import("@/lib/aiRuntime/workflows/ai-10-fixed-asset"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI10_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: unknown; actual: unknown }[] = [];

    for (const goldenCase of AI10_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const passed =
        actual.capitalCandidateFinding === goldenCase.expected.capitalCandidateFinding &&
        (goldenCase.expected.thresholdConfiguredInDetail === undefined || actual.thresholdConfiguredInDetail === goldenCase.expected.thresholdConfiguredInDetail) &&
        actual.fxUnsupportedFinding === goldenCase.expected.fxUnsupportedFinding &&
        (goldenCase.expected.scheduleCreated === undefined || actual.scheduleCreated === goldenCase.expected.scheduleCreated) &&
        (goldenCase.expected.scheduleSum === undefined || actual.scheduleSum === goldenCase.expected.scheduleSum);
      results.push({ id: goldenCase.id, passed, expected: goldenCase.expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-10 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai14golden";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockMove from "@/models/inventory/StockMove";
import Customer from "@/models/sales/Customer";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI14_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, GOLDEN_PERIOD, type GoldenAi14Case } from "@/tests/golden/ai14/goldenCases";

/**
 * The golden-dataset CI check for AI-14 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * behaviour change altered outcomes, which a per-assertion test can miss if it only checks the
 * cases it happens to include.
 */

// AI-14 has no LLM call anywhere in the workflow — driver decomposition is exact-by-construction
// arithmetic over posted journal lines (its own module doc comment says so explicitly). 100% is
// therefore the only honest bar, same reasoning as AI-27/AI-07's golden datasets.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai14FluxAnalysis: typeof import("@/lib/aiRuntime/workflows/ai-14-flux-analysis").ai14FluxAnalysis;

async function seedAndRun(tenantId: string, goldenCase: GoldenAi14Case) {
  const expenseAcc = await Account.create({ tenantId, name: "Expense", code: `EXP-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", internal_group: "expense", isActive: true, isLocked: false, status: "active" });
  const cashAcc = await Account.create({ tenantId, name: "Cash", code: `CASH-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_cash", internal_group: "asset", isActive: true, isLocked: false, status: "active" });

  const vendorIds = new Map<string, mongoose.Types.ObjectId>();
  for (const entry of goldenCase.entries) {
    if (!vendorIds.has(entry.vendor)) {
      const v = await Customer.create({ tenantId, header: { name: entry.vendor, is_company: true }, createdBy: GOLDEN_CREATOR });
      vendorIds.set(entry.vendor, v._id as mongoose.Types.ObjectId);
    }
    const partnerId = vendorIds.get(entry.vendor);
    await JournalEntry.create({
      tenantId,
      header: { name: `GOLDEN-JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: new Date(entry.date), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: expenseAcc._id, label: entry.label ?? "line", debit: entry.amount, credit: 0, partnerId },
        { accountId: cashAcc._id, label: entry.label ?? "line", debit: 0, credit: entry.amount },
      ],
      totals: { amountUntaxed: entry.amount, amountTax: 0, amountTotal: entry.amount },
    });
  }

  if (goldenCase.materialityPolicy) {
    await AiMaterialityPolicy.create({ tenantId, thresholds: [{ appliesTo: "flux_analysis", ...goldenCase.materialityPolicy }] });
  }
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-14", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

  const envelope = await runWorkflow(ai14FluxAnalysis, {
    tenantId,
    eventKey: "period.horizon.reached",
    payload: { period: GOLDEN_PERIOD, periodEnd: new Date(`${GOLDEN_PERIOD}-28T23:59:59Z`).toISOString() },
  });

  const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
  const proposal = trace!.rawProposal as unknown as {
    comparisons: { accountId: string; variance: number; drivers: { type: string; amount: number }[] }[];
  };
  const row = proposal.comparisons.find((c) => c.accountId === String(expenseAcc._id));

  return { envelope, row, expenseAccountId: String(expenseAcc._id) };
}

describe("AI-14 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Invoice.init(), PurchaseOrder.init(), StockMove.init(), Customer.init(),
      AiMaterialityPolicy.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai14FluxAnalysis } = await import("@/lib/aiRuntime/workflows/ai-14-flux-analysis"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI14_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; detail: unknown }[] = [];

    for (const goldenCase of AI14_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const { envelope, row, expenseAccountId } = await seedAndRun(tenantId, goldenCase);

      // Scoped to the expense account under test only, by subjectRef id — the offsetting cash
      // account moves by the same magnitude in the opposite direction (real double-entry
      // accounting) and legitimately raises its own, separate "Material movement" finding, which
      // is correct AI-14 behaviour, not something this case is testing.
      const materialFindings = envelope.findings.filter((f) => f.title.includes("Material movement") && f.subjectRefs?.some((r) => r.id === expenseAccountId));
      let passed = materialFindings.length === goldenCase.expected.findingCount;
      const detail: Record<string, unknown> = { findingCount: materialFindings.length, expectedFindingCount: goldenCase.expected.findingCount };

      if (passed && goldenCase.expected.findingCount > 0) {
        detail.variance = row?.variance;
        if (goldenCase.expected.varianceExpected !== undefined) {
          passed = passed && row !== undefined && Math.abs(row.variance - goldenCase.expected.varianceExpected) < 0.01;
        }
        if (goldenCase.expected.driverTypeExpected !== undefined) {
          const driver = row?.drivers.find((d) => d.type === goldenCase.expected.driverTypeExpected);
          detail.driver = driver;
          passed = passed && driver !== undefined;
          if (passed && goldenCase.expected.driverAmountExpected !== undefined && driver) {
            passed = passed && Math.abs(driver.amount - goldenCase.expected.driverAmountExpected) < 0.01;
          }
        }
      }

      results.push({ id: goldenCase.id, passed, detail });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-14 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

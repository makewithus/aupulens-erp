import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { addDays } from "date-fns";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai16golden";

import Account from "@/models/finance/Account";
import BankAccount from "@/models/finance/BankAccount";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import FxRate from "@/models/finance/FxRate";
import Payroll from "@/models/hr/Payroll";
import Customer from "@/models/sales/Customer";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiSchedule from "@/models/ai/AiSchedule";
import { AI16_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type GoldenAi16Case } from "@/tests/golden/ai16/goldenCases";

/**
 * The golden-dataset CI check for AI-16 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * behaviour change altered outcomes, which a per-assertion test can miss if it only checks the
 * cases it happens to include.
 */

// AI-16's forecast/risk logic is plain deterministic arithmetic over AI-05/AI-06's own persisted
// outputs — no LLM call anywhere in this workflow (see goldenCases.ts doc comment). 100% is
// therefore the only honest bar, same reasoning as AI-27/AI-14's golden datasets.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai16CashIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-16-cash-intelligence").ai16CashIntelligence;

async function seedAndRun(tenantId: string, goldenCase: GoldenAi16Case) {
  const glAccount = await Account.create({ tenantId, name: "Bank INR", code: `BANK-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_cash", isActive: true, isLocked: false, status: "active" });
  const bankAccount = await BankAccount.create({ tenantId, accountName: "Bank INR", currency: "INR", glAccountId: glAccount._id, createdBy: GOLDEN_CREATOR });
  await BankStatement.create({
    tenantId,
    header: { name: `GOLDEN-STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, journalId: glAccount._id, date: new Date(), balance_start: 0, balance_end_real: goldenCase.bankBalance },
    lineIds: [],
    status: "draft",
  });

  if (goldenCase.inflows && goldenCase.inflows.length > 0) {
    await AiDecisionTrace.create({
      tenantId,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-05",
      workflowVersion: "1.0.0",
      inputsHash: "golden",
      rawProposal: { predictedPayments: goldenCase.inflows.map((i) => ({ invoiceId: i.ref, amount: i.amount, predictedDate: addDays(new Date(), i.daysFromToday).toISOString() })) },
      confidenceComponents: {},
      finalizedAt: new Date(),
    });
  }
  if (goldenCase.outflows && goldenCase.outflows.length > 0) {
    await AiDecisionTrace.create({
      tenantId,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-06",
      workflowVersion: "1.0.0",
      inputsHash: "golden",
      rawProposal: { dueSchedule: goldenCase.outflows.map((o) => ({ billId: o.ref, amount: o.amount, currency: "INR", dueDate: addDays(new Date(), o.daysFromToday).toISOString() })) },
      confidenceComponents: {},
      finalizedAt: new Date(),
    });
  }

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

  const envelope = await runWorkflow(ai16CashIntelligence, { tenantId, eventKey: "ai.sweep.hourly", payload: {} });
  const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
  const proposal = trace!.rawProposal as unknown as { risks: { shortfall: number; cause: string }[] };

  return { envelope, proposal };
}

describe("AI-16 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), BankAccount.init(), BankStatement.init(), JournalEntry.init(), FxRate.init(), Payroll.init(), Customer.init(),
      AiDecisionTrace.init(), AiWorkflowRun.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiSchedule.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai16CashIntelligence } = await import("@/lib/aiRuntime/workflows/ai-16-cash-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI16_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; detail: unknown }[] = [];

    for (const goldenCase of AI16_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const { envelope, proposal } = await seedAndRun(tenantId, goldenCase);

      const shortfallFindings = envelope.findings.filter((f) => f.title.includes("Projected cash shortfall"));
      const concentrationRisks = proposal.risks.filter((r) => r.cause.includes("concentration risk"));

      let passed = shortfallFindings.length === goldenCase.expected.shortfallFindingCount;
      passed = passed && proposal.risks.length === goldenCase.expected.totalRiskCount;
      passed = passed && (concentrationRisks.length > 0) === goldenCase.expected.concentrationRiskExpected;
      if (passed && goldenCase.expected.shortfallFindingCount > 0 && goldenCase.expected.shortfallAmountExpected !== undefined) {
        passed = passed && Math.abs(shortfallFindings[0].amount! - goldenCase.expected.shortfallAmountExpected) < 0.01;
      }

      const detail = { shortfallFindingCount: shortfallFindings.length, totalRiskCount: proposal.risks.length, concentrationRiskCount: concentrationRisks.length, risks: proposal.risks };
      results.push({ id: goldenCase.id, passed, detail });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-16 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

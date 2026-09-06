import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai12golden";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import TaxRate from "@/models/finance/TaxRate";
import JournalEntry from "@/models/finance/JournalEntry";
import User from "@/models/auth/User";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI12_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, PERIOD, type Ai12GoldenCase } from "@/tests/golden/ai12/goldenCases";

/**
 * The golden-dataset CI check for AI-12 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Unlike a normal test
 * (proves the code does what it did yesterday), this reports a PASS RATE across a named case set
 * and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a future change to
 * AI-12's reconciliation/missing-evidence logic altered real behaviour.
 */

// AI-12's three-way reconciliation and missing-evidence checks are pure arithmetic/set
// comparisons over already-projected `AiTaxTransaction` rows — no LLM call anywhere in this
// workflow (its own doc comment: "the AI never computes a tax figure"; confirmed by reading
// index.ts's act() in full). Every case here is therefore fully deterministic, so 100% is the
// only honest bar — a regression would mean the arithmetic itself changed, not that a model
// answered differently.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai12TaxIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-12-tax-intelligence").ai12TaxIntelligence;

async function seedCase(tenantId: string, goldenCase: Ai12GoldenCase) {
  const partner = await Customer.create({
    tenantId,
    header: { name: "Golden Co", is_company: true },
    gstin: goldenCase.invoice.partnerGstin,
    createdBy: GOLDEN_CREATOR,
  });

  const invDate = new Date(Date.UTC(2026, 0, goldenCase.invoice.day));
  await Invoice.create({
    tenantId,
    name: `GOLDEN-AI12-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId: partner._id,
    moveType: goldenCase.invoice.moveType,
    state: "posted",
    invoiceDate: invDate,
    dueDate: invDate,
    invoiceLines: [{ name: "Goods", priceSubtotal: goldenCase.invoice.amountUntaxed, quantity: 1, priceUnit: goldenCase.invoice.amountUntaxed }],
    amountUntaxed: goldenCase.invoice.amountUntaxed,
    amountTax: goldenCase.invoice.amountTax,
    amountTotal: goldenCase.invoice.amountUntaxed + goldenCase.invoice.amountTax,
  });

  if (goldenCase.ledger) {
    const user = await User.create({ tenantId, name: "Golden Finance", email: `golden-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    const controlAcc = await Account.create({ tenantId, name: `GST Payable ${Date.now()}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "liability_current", isActive: true, isLocked: false, status: "active" });
    const otherAcc = await Account.create({ tenantId, name: `Expense ${Date.now()}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true, isLocked: false, status: "active" });
    await TaxRate.create({ tenantId, name: `GST 18% ${Date.now()}`, type: "gst", ratePercent: 18, appliesTo: "both", accountId: controlAcc._id, status: "active", createdBy: user._id });

    const ledgerDate = new Date(Date.UTC(2026, 0, goldenCase.ledger.day));
    const amount = goldenCase.ledger.controlAccountAmount;
    const controlDebit = goldenCase.ledger.controlLeg === "debit" ? amount : 0;
    const controlCredit = goldenCase.ledger.controlLeg === "debit" ? 0 : amount;
    await JournalEntry.create({
      tenantId,
      header: { name: `JE-golden-ai12-${Date.now()}`, date: ledgerDate, journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc._id, label: "line", debit: controlDebit, credit: controlCredit },
        { accountId: otherAcc._id, label: "line", debit: controlCredit, credit: controlDebit },
      ],
      totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
    });
  }

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
}

describe("AI-12 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Account.init(), TaxRate.init(), JournalEntry.init(), User.init(),
      AiTaxTransaction.init(), AiComplianceProfile.init(), AiWorkflowRun.init(), AiDecisionTrace.init(),
      AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai12TaxIntelligence } = await import("@/lib/aiRuntime/workflows/ai-12-tax-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI12_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; reason?: string }[] = [];

    for (const goldenCase of AI12_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);

      const envelope = await runWorkflow(ai12TaxIntelligence, {
        tenantId,
        eventKey: "period.horizon.reached",
        payload: { period: PERIOD, periodEnd: new Date(Date.UTC(2026, 0, 31, 23, 59, 59)).toISOString() },
      });

      const threeWayFindings = envelope.findings.filter((f) => f.title.startsWith("Tax three-way mismatch"));
      const missingEvidenceFindings = envelope.findings.filter((f) => f.title.includes("counterparty registration number"));

      const reasons: string[] = [];
      if (threeWayFindings.length !== goldenCase.expected.threeWayFindingCount) reasons.push(`threeWayFindingCount: expected ${goldenCase.expected.threeWayFindingCount}, got ${threeWayFindings.length}`);
      if (missingEvidenceFindings.length !== goldenCase.expected.missingEvidenceFindingCount) reasons.push(`missingEvidenceFindingCount: expected ${goldenCase.expected.missingEvidenceFindingCount}, got ${missingEvidenceFindings.length}`);
      if (envelope.findings.length !== goldenCase.expected.totalFindingCount) reasons.push(`totalFindingCount: expected ${goldenCase.expected.totalFindingCount}, got ${envelope.findings.length}`);

      if (goldenCase.expected.ledgerVsTransactionsAmount !== undefined) {
        const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
        const proposal = trace!.rawProposal as unknown as { threeWay: { differences: { pair: string; amount: number }[] } };
        const diff = proposal.threeWay.differences.find((d) => d.pair === "ledger_vs_transactions");
        const actualAmount = diff ? Math.abs(diff.amount) : NaN;
        if (Math.abs(actualAmount - goldenCase.expected.ledgerVsTransactionsAmount) > 0.01) {
          reasons.push(`ledgerVsTransactionsAmount: expected ~${goldenCase.expected.ledgerVsTransactionsAmount}, got ${actualAmount}`);
        }
      }

      results.push({ id: goldenCase.id, passed: reasons.length === 0, reason: reasons.join("; ") || undefined });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-12 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

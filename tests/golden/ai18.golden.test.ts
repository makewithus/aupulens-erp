import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai18golden";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiCloseState from "@/models/ai/AiCloseState";
import PeriodClosing from "@/models/finance/PeriodClosing";
import BankStatement from "@/models/finance/BankStatement";
import Asset from "@/models/finance/Asset";
import TaxRate from "@/models/finance/TaxRate";
import AiSchedule from "@/models/ai/AiSchedule";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiEvidencePack from "@/models/ai/AiEvidencePack";
import { AI18_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, PERIOD, PERIOD_END, type Ai18GoldenCase } from "@/tests/golden/ai18/goldenCases";

/**
 * The golden-dataset CI check for AI-18 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Reports a PASS RATE
 * across a named case set, the way `tests/golden/ai27.golden.test.ts` does.
 */

// AI-18 is OBSERVE-only, composes AI-21/AI-22's already-hardened tracing, and makes zero model
// calls anywhere (every Claim is a cited, deterministic trace over real records — confirmed by
// reading index.ts and traceEvidence.ts in full). Every case here is fully deterministic, so 100%
// is the only honest bar.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai18AuditEvidence: typeof import("@/lib/aiRuntime/workflows/ai-18-audit-evidence").ai18AuditEvidence;

const [PERIOD_YEAR, PERIOD_MONTH] = PERIOD.split("-").map(Number);
const POSTING_DATE = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH - 1, 10));

async function seedAi14Comparison(tenantId: string, accountId: string, materialityVerdict: string) {
  const run = await AiWorkflowRun.create({
    tenantId, workflowId: "AI-14", workflowVersion: "1.0.0", entityId: tenantId, status: "completed", autonomyApplied: "observe", summary: "seed",
    findings: [], metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 }, startedAt: new Date(), finishedAt: new Date(),
  });
  await AiDecisionTrace.create({
    tenantId, runId: run._id, workflowId: "AI-14", workflowVersion: "1.0.0", inputsHash: "seed", reasonChain: [],
    rawProposal: { comparisons: [{ accountId, materialityVerdict, variance: 5000, unexplainedAmount: 5000, drivers: [] }] },
    confidenceComponents: {}, finalOutcome: "completed",
  });
}

async function seedCase(tenantId: string, goldenCase: Ai18GoldenCase) {
  if (!goldenCase.seedMaterialComparison) {
    await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-18", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    return;
  }

  const vendor = await Customer.create({ tenantId, header: { name: "Golden Vendor Co", is_company: true }, createdBy: GOLDEN_CREATOR });
  const controlAcc = await Account.create({ tenantId, name: `AP Control Golden ${Date.now()}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "liability_payable", internal_group: "liability", isActive: true, isLocked: false, status: "active" });
  const expenseAcc = await Account.create({ tenantId, name: `Expense Golden ${Date.now()}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", internal_group: "expense", isActive: true, isLocked: false, status: "active" });

  const bill = await Invoice.create({
    tenantId, name: `GOLDEN-AI18-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
    invoiceDate: POSTING_DATE, dueDate: POSTING_DATE,
    invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
    amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
  });

  if (goldenCase.hasExtractedDocument) {
    await ExtractedDocument.create({ tenantId, docType: "vendor_bill", fileName: "golden-bill.pdf", extraction: {}, aiConfidence: 0.9, createdRecordModel: "Invoice", createdRecordId: bill._id, createdBy: GOLDEN_CREATOR });
  }

  if (goldenCase.glUnreconciled) {
    // The GL nets to 0 (offsetting lines on the same control account) against a real ₹1000 open
    // invoice — a genuine, real reconciliation failure AI-22's engine independently detects, not
    // a faked "unreconciled" flag.
    await JournalEntry.create({
      tenantId, header: { name: `JE-golden-ai18-${Date.now()}`, date: POSTING_DATE, journalType: "purchase" }, status: "posted", voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc._id, label: "line", debit: 100, credit: 0, sourceId: bill._id },
        { accountId: controlAcc._id, label: "line", debit: 0, credit: 100 },
      ],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    });
  } else {
    // A real, fully-tied-out posting for the same open invoice — reconciled, not swept.
    await JournalEntry.create({
      tenantId, header: { name: `JE-golden-ai18-tied-${Date.now()}`, date: POSTING_DATE, journalType: "purchase" }, status: "posted", voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc._id, label: "line", debit: 0, credit: 1000, sourceId: bill._id },
        { accountId: expenseAcc._id, label: "line", debit: 1000, credit: 0 },
      ],
      totals: { amountUntaxed: 1000, amountTax: 0, amountTotal: 1000 },
    });
  }

  await seedAi14Comparison(tenantId, String(controlAcc._id), "material");
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-18", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
}

describe("AI-18 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Invoice.init(), Customer.init(), ExtractedDocument.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiCloseState.init(), PeriodClosing.init(),
      BankStatement.init(), Asset.init(), TaxRate.init(), AiSchedule.init(), AiTaxTransaction.init(), AiComplianceProfile.init(), AiMaterialityPolicy.init(),
      AiEvidencePack.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai18AuditEvidence } = await import("@/lib/aiRuntime/workflows/ai-18-audit-evidence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI18_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; reason?: string }[] = [];

    for (const goldenCase of AI18_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);

      const envelope = await runWorkflow(ai18AuditEvidence, { tenantId, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodEnd: PERIOD_END.toISOString() } });

      const missingEvidenceFindings = envelope.findings.filter((f) => f.title.startsWith("Missing evidence"));
      const sweepCapFindings = envelope.findings.filter((f) => f.title.includes("not yet evidenced this run"));
      const pack = await AiEvidencePack.findOne({ tenantId, packId: `${PERIOD}-sweep` }).lean();

      const reasons: string[] = [];
      if (missingEvidenceFindings.length !== goldenCase.expected.missingEvidenceFindingCount) reasons.push(`missingEvidenceFindingCount: expected ${goldenCase.expected.missingEvidenceFindingCount}, got ${missingEvidenceFindings.length}`);
      if (sweepCapFindings.length !== goldenCase.expected.sweepCapFindingCount) reasons.push(`sweepCapFindingCount: expected ${goldenCase.expected.sweepCapFindingCount}, got ${sweepCapFindings.length}`);
      if (envelope.findings.length !== goldenCase.expected.totalFindingCount) reasons.push(`totalFindingCount: expected ${goldenCase.expected.totalFindingCount}, got ${envelope.findings.length}`);
      const actualCompletenessIsOne = pack ? pack.completenessScore === 1 : undefined;
      if (actualCompletenessIsOne !== goldenCase.expected.completenessScoreIsOne) reasons.push(`completenessScoreIsOne: expected ${goldenCase.expected.completenessScoreIsOne}, got ${actualCompletenessIsOne} (score=${pack?.completenessScore})`);

      results.push({ id: goldenCase.id, passed: reasons.length === 0, reason: reasons.join("; ") || undefined });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-18 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

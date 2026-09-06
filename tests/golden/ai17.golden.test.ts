import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai17golden";

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
import { AI17_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, currentPeriodYYYYMM, type Ai17GoldenCase } from "@/tests/golden/ai17/goldenCases";

/**
 * The golden-dataset CI check for AI-17 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Reports a PASS RATE
 * across a named case set, the way `tests/golden/ai27.golden.test.ts` does.
 */

// AI-17 is OBSERVE-only with zero tool calls and zero model calls anywhere (confirmed by reading
// index.ts's act() — a no-op by construction, and computeReadiness.ts — plain arithmetic/set
// comparisons). Every case here is fully deterministic, so 100% is the only honest bar.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai17ComplianceReadiness: typeof import("@/lib/aiRuntime/workflows/ai-17-compliance-readiness").ai17ComplianceReadiness;
let rebuildTaxProjection: typeof import("@/lib/aiRuntime/tax/rebuildTaxProjection").rebuildTaxProjection;

const PERIOD = currentPeriodYYYYMM();
const [PERIOD_YEAR, PERIOD_MONTH] = PERIOD.split("-").map(Number);

async function seedCase(tenantId: string, goldenCase: Ai17GoldenCase) {
  await AiComplianceProfile.create({
    tenantId,
    registrations: goldenCase.registrationOnFile ? [{ jurisdiction: "IN-KA", taxType: "gst", registrationNumber: "29ABCDE1234F1Z5", effectiveFrom: new Date("2020-01-01") }] : [],
    obligations: [
      {
        jurisdiction: "IN-KA",
        taxType: "gst",
        returnType: "monthly_gst_return",
        frequency: "monthly",
        dueDayOffset: goldenCase.dueDayOffset,
        firstPeriod: "2020-01",
        warningWindowDays: goldenCase.warningWindowDays,
      },
    ],
  });

  if (goldenCase.invoice) {
    const partner = await Customer.create({ tenantId, header: { name: "Golden Co", is_company: true }, gstin: goldenCase.invoice.partnerGstin, createdBy: GOLDEN_CREATOR });
    const invDate = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH - 1, goldenCase.invoice.day));
    await Invoice.create({
      tenantId,
      name: `GOLDEN-AI17-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
  }

  if (goldenCase.ledger) {
    const user = await User.create({ tenantId, name: "Golden Finance", email: `golden-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    const controlAcc = await Account.create({ tenantId, name: `GST Payable ${Date.now()}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "liability_current", isActive: true, isLocked: false, status: "active" });
    const otherAcc = await Account.create({ tenantId, name: `Expense ${Date.now()}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true, isLocked: false, status: "active" });
    await TaxRate.create({ tenantId, name: `GST 18% ${Date.now()}`, type: "gst", ratePercent: 18, appliesTo: "both", accountId: controlAcc._id, status: "active", createdBy: user._id });

    const ledgerDate = new Date(Date.UTC(PERIOD_YEAR, PERIOD_MONTH - 1, goldenCase.ledger.day));
    const amount = goldenCase.ledger.controlAccountAmount;
    const controlDebit = goldenCase.ledger.controlLeg === "debit" ? amount : 0;
    const controlCredit = goldenCase.ledger.controlLeg === "debit" ? 0 : amount;
    await JournalEntry.create({
      tenantId,
      header: { name: `JE-golden-ai17-${Date.now()}`, date: ledgerDate, journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc._id, label: "line", debit: controlDebit, credit: controlCredit },
        { accountId: otherAcc._id, label: "line", debit: controlCredit, credit: controlDebit },
      ],
      totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
    });
  }

  if (goldenCase.invoice) {
    await rebuildTaxProjection(tenantId, PERIOD);
  }

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-17", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
}

describe("AI-17 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Account.init(), TaxRate.init(), JournalEntry.init(), User.init(),
      AiTaxTransaction.init(), AiComplianceProfile.init(), AiWorkflowRun.init(), AiDecisionTrace.init(),
      AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai17ComplianceReadiness } = await import("@/lib/aiRuntime/workflows/ai-17-compliance-readiness"));
    ({ rebuildTaxProjection } = await import("@/lib/aiRuntime/tax/rebuildTaxProjection"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI17_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; reason?: string }[] = [];

    for (const goldenCase of AI17_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);

      const envelope = await runWorkflow(ai17ComplianceReadiness, { tenantId, eventKey: "period.horizon.reached", payload: { period: PERIOD } });

      const registrationGapFindings = envelope.findings.filter((f) => f.title.startsWith("Registration gap"));
      const obligationFindings = envelope.findings.filter((f) => f.title.includes("obligation is"));

      const reasons: string[] = [];
      if (registrationGapFindings.length !== goldenCase.expected.registrationGapCount) reasons.push(`registrationGapCount: expected ${goldenCase.expected.registrationGapCount}, got ${registrationGapFindings.length}`);
      if (obligationFindings.length !== goldenCase.expected.obligationFindingCount) reasons.push(`obligationFindingCount: expected ${goldenCase.expected.obligationFindingCount}, got ${obligationFindings.length}`);
      if (envelope.findings.length !== goldenCase.expected.totalFindingCount) reasons.push(`totalFindingCount: expected ${goldenCase.expected.totalFindingCount}, got ${envelope.findings.length}`);
      if (goldenCase.expected.obligationReadiness) {
        const expectedSubstring = `obligation is ${goldenCase.expected.obligationReadiness}`;
        if (!obligationFindings.some((f) => f.title.includes(expectedSubstring))) {
          reasons.push(`obligationReadiness: expected a finding titled "...${expectedSubstring}...", got [${obligationFindings.map((f) => f.title).join(", ")}]`);
        }
      }

      results.push({ id: goldenCase.id, passed: reasons.length === 0, reason: reasons.join("; ") || undefined });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-17 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

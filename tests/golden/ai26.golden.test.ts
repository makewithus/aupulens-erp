import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai26golden";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiAccountingPolicy from "@/models/ai/AiAccountingPolicy";
import AiPolicyFinding from "@/models/ai/AiPolicyFinding";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI26_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type GoldenCase } from "@/tests/golden/ai26/goldenCases";

/**
 * The golden-dataset CI check for AI-26 (docs/ai/BRIEF-09-VERIFICATION.md 0.3). Unlike a normal
 * test (proves the code does what it did yesterday), this reports a PASS RATE across a named case
 * set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a scoring
 * change altered real behaviour, which a per-assertion test can miss if it only checks the cases
 * it happens to include.
 */

const PASS_RATE_THRESHOLD = 1.0; // AI-26's consistency sweep (lib/aiRuntime/policyIntelligence/consistency.ts) is a deterministic query over Invoice/Account/AiMaterialityPolicy — no model call in the loop, so 100% is the honest bar, same as AI-27.

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai26AccountingPolicy: typeof import("@/lib/aiRuntime/workflows/ai-26-accounting-policy").ai26AccountingPolicy;

const CREATOR = new mongoose.Types.ObjectId();

async function makeVendor(tenantId: string) {
  const c = await Customer.create({ tenantId, header: { name: "Golden Equipment Co", is_company: true }, createdBy: CREATOR });
  return c._id as mongoose.Types.ObjectId;
}

async function makeAccount(tenantId: string, accountType: string) {
  const a = await Account.create({ tenantId, name: `Account ${accountType}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: accountType, isActive: true, isLocked: false, status: "active" });
  return a._id as mongoose.Types.ObjectId;
}

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const thresholds: { appliesTo: string; absoluteAmount: number }[] = [];
  if (goldenCase.capitalisationThreshold !== undefined) thresholds.push({ appliesTo: "capitalisation", absoluteAmount: goldenCase.capitalisationThreshold });
  for (const cls of goldenCase.additionalConfiguredThresholds ?? []) thresholds.push({ appliesTo: cls, absoluteAmount: 1000 });
  if (thresholds.length > 0) await AiMaterialityPolicy.create({ tenantId, thresholds });

  if (goldenCase.bills.length > 0) {
    const vendor = await makeVendor(tenantId);
    const accountByType = new Map<string, mongoose.Types.ObjectId>();
    for (const bill of goldenCase.bills) {
      if (!accountByType.has(bill.accountType)) accountByType.set(bill.accountType, await makeAccount(tenantId, bill.accountType));
      const accountId = accountByType.get(bill.accountType)!;
      await Invoice.create({
        tenantId,
        name: bill.name,
        partnerId: vendor,
        moveType: "in_invoice",
        state: "posted",
        invoiceDate: new Date(bill.date),
        dueDate: new Date(bill.date),
        invoiceLines: [{ name: "line", priceSubtotal: bill.amount, quantity: 1, priceUnit: bill.amount, accountId }],
        amountUntaxed: bill.amount,
        amountTax: 0,
        amountTotal: bill.amount,
        amountResidual: bill.amount,
        paymentState: "not_paid",
      });
    }
  }
}

describe("AI-26 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Account.init(), JournalEntry.init(), AiMaterialityPolicy.init(), AiAccountingPolicy.init(), AiPolicyFinding.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai26AccountingPolicy } = await import("@/lib/aiRuntime/workflows/ai-26-accounting-policy"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI26_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; reason?: string }[] = [];

    for (const goldenCase of AI26_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      await seedCase(tenantId, goldenCase);
      await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-26", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

      const envelope = await runWorkflow(ai26AccountingPolicy, { tenantId, eventKey: "ai.sweep.hourly", payload: {} });
      const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
      const proposal = trace!.rawProposal as unknown as {
        inconsistencies: { pattern: string; treatmentA: { examples: unknown[] }; treatmentB: { examples: unknown[] } }[];
        policyGaps: { gap: string }[];
      };

      let passed = true;
      const reasons: string[] = [];

      const inconsistencyFindings = envelope.findings.filter((f) => f.title.startsWith("Inconsistent treatment"));
      if (proposal.inconsistencies.length !== goldenCase.expected.inconsistencyFindingCount || inconsistencyFindings.length !== goldenCase.expected.inconsistencyFindingCount) {
        passed = false;
        reasons.push(`inconsistency count: proposal=${proposal.inconsistencies.length} findings=${inconsistencyFindings.length} expected=${goldenCase.expected.inconsistencyFindingCount}`);
      }
      if (goldenCase.expected.inconsistencyFindingCount === 1 && proposal.inconsistencies.length === 1) {
        const inc = proposal.inconsistencies[0];
        if (goldenCase.expected.treatmentACount !== undefined && inc.treatmentA.examples.length !== goldenCase.expected.treatmentACount) {
          passed = false;
          reasons.push(`treatmentA examples: ${inc.treatmentA.examples.length} !== expected ${goldenCase.expected.treatmentACount}`);
        }
        if (goldenCase.expected.treatmentBCount !== undefined && inc.treatmentB.examples.length !== goldenCase.expected.treatmentBCount) {
          passed = false;
          reasons.push(`treatmentB examples: ${inc.treatmentB.examples.length} !== expected ${goldenCase.expected.treatmentBCount}`);
        }
      }

      for (const cls of goldenCase.expected.uncoveredActionClassesMustBeAbsent ?? []) {
        const stillGapped = proposal.policyGaps.some((g) => g.gap.includes(`no materiality/policy threshold configured for "${cls}"`));
        if (stillGapped) {
          passed = false;
          reasons.push(`action class "${cls}" still reported as an uncovered-transaction-type gap despite being configured`);
        }
      }

      results.push({ id: goldenCase.id, passed, reason: reasons.length > 0 ? reasons.join("; ") : undefined });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-26 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai25golden";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI25_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type Ai25GoldenCase } from "@/tests/golden/ai25/goldenCases";

/**
 * The golden-dataset CI check for AI-25 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Reports a PASS RATE
 * across a named case set, the way `tests/golden/ai27.golden.test.ts` does.
 */

// AI-25 is read-only by construction (no write tool exists for this workflow at all) and its
// DSO/DPO/DIO/CCC formulas are plain arithmetic over already-built aged/journal reports — no LLM
// call anywhere (confirmed by reading index.ts in full: "read-only by construction"). Every case
// here is fully deterministic, so 100% is the only honest bar.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai25WorkingCapitalIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-25-working-capital-intelligence").ai25WorkingCapitalIntelligence;

async function seedCase(tenantId: string, goldenCase: Ai25GoldenCase, userId: string) {
  const accountsByKey = new Map<string, string>();
  for (const acc of goldenCase.accounts) {
    const created = await Account.create({ tenantId, name: acc.name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: acc.accountType, internal_group: acc.internalGroup, isActive: true, isLocked: false, status: "active" });
    accountsByKey.set(acc.key, String(created._id));
  }

  const partnersByKey = new Map<string, string>();
  for (const key of goldenCase.partners) {
    const created = await Customer.create({ tenantId, header: { name: key }, contact_details: {}, createdBy: userId });
    partnersByKey.set(key, String(created._id));
  }

  for (const posting of goldenCase.postings) {
    const partnerId = posting.partnerKey ? partnersByKey.get(posting.partnerKey) : undefined;
    await JournalEntry.create({
      tenantId,
      header: { name: `JE-golden-ai25-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: new Date(posting.date), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: accountsByKey.get(posting.debitAccountKey), label: "line", debit: posting.amount, credit: 0, partnerId },
        { accountId: accountsByKey.get(posting.creditAccountKey), label: "line", debit: 0, credit: posting.amount, partnerId },
      ],
      totals: { amountUntaxed: posting.amount, amountTax: 0, amountTotal: posting.amount },
    });
  }

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-25", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
}

describe("AI-25 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), JournalEntry.init(), Customer.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai25WorkingCapitalIntelligence } = await import("@/lib/aiRuntime/workflows/ai-25-working-capital-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI25_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; reason?: string }[] = [];

    for (const goldenCase of AI25_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const user = await User.create({ tenantId, name: "Golden Finance", email: `golden-ai25-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
      await seedCase(tenantId, goldenCase, String(user._id));

      const [py, pm] = goldenCase.period.split("-").map(Number);
      const periodEnd = new Date(Date.UTC(py, pm, 0, 23, 59, 59, 999)).toISOString();
      const envelope = await runWorkflow(ai25WorkingCapitalIntelligence, {
        tenantId,
        eventKey: "period.horizon.reached",
        payload: { period: goldenCase.period, periodEnd, actingUserId: String(user._id) },
      });
      const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
      const proposal = trace!.rawProposal as unknown as {
        metrics: { dso: number | null; dio: number | null };
        drivers: { type: string; entityName: string; cashImpact: number }[];
        recommendedActions: unknown[];
      };

      const reasons: string[] = [];
      if (goldenCase.expected.dso !== undefined && Math.abs((proposal.metrics.dso ?? NaN) - goldenCase.expected.dso) > 0.1) {
        reasons.push(`dso: expected ~${goldenCase.expected.dso}, got ${proposal.metrics.dso}`);
      }
      if (goldenCase.expected.dio !== undefined && proposal.metrics.dio !== goldenCase.expected.dio) {
        reasons.push(`dio: expected ${goldenCase.expected.dio}, got ${proposal.metrics.dio}`);
      }
      if (goldenCase.expected.dominantDriver) {
        const top = proposal.drivers[0];
        const d = goldenCase.expected.dominantDriver;
        if (!top || top.type !== d.type || top.entityName !== d.entityName || Math.abs(top.cashImpact - d.cashImpact) > 0.01) {
          reasons.push(`dominantDriver: expected ${JSON.stringify(d)}, got ${JSON.stringify(top)}`);
        }
      }
      if (goldenCase.expected.driverCount !== undefined && proposal.drivers.length !== goldenCase.expected.driverCount) {
        reasons.push(`driverCount: expected ${goldenCase.expected.driverCount}, got ${proposal.drivers.length}`);
      }
      if (goldenCase.expected.recommendedActionCount !== undefined && proposal.recommendedActions.length !== goldenCase.expected.recommendedActionCount) {
        reasons.push(`recommendedActionCount: expected ${goldenCase.expected.recommendedActionCount}, got ${proposal.recommendedActions.length}`);
      }

      results.push({ id: goldenCase.id, passed: reasons.length === 0, reason: reasons.join("; ") || undefined });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-25 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

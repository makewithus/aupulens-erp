import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai03golden";

import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import { AI03_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type GoldenCase } from "@/tests/golden/ai03/goldenCases";

/**
 * The golden-dataset CI check for AI-03 (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3). Unlike a
 * normal test (proves the code does what it did yesterday), this reports a PASS RATE across a
 * named case set and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a
 * change to the matcher (lib/aiRuntime/workflows/ai-03-bank-reconciliation/matcher.ts) or the
 * workflow's own reason/act logic altered real matching behaviour.
 */

// AI-03's matching logic (findExactMatches / classifyUnresolvedLine in matcher.ts) is pure
// deterministic date-window + amount-tolerance + keyword/cross-account heuristics — no model call
// anywhere in the loop (confirmed by reading matcher.ts and index.ts, not assumed) — so 100% is
// the only honest bar, exactly as for AI-27.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai03BankReconciliation: typeof import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation").ai03BankReconciliation;

async function seedCase(tenantId: string, goldenCase: GoldenCase) {
  const bankAccount = await Account.create({
    tenantId,
    name: "Bank Current Account",
    code: `BANK-${Math.random().toString(36).slice(2, 8)}`,
    account_type: "asset_cash",
    isActive: true,
  });
  const contraAccount = await Account.create({
    tenantId,
    name: "Accounts Receivable",
    code: `AR-${Math.random().toString(36).slice(2, 8)}`,
    account_type: "asset_receivable",
    isActive: true,
  });
  // Present unconditionally so Pass 3's fee/interest draft-journal path (a real decision branch,
  // not guessed) has a placeholder expense leg to draft against, same as the unit test fixtures.
  await Account.create({
    tenantId,
    name: "Bank Charges",
    code: `EXP-${Math.random().toString(36).slice(2, 8)}`,
    account_type: "expense",
    isActive: true,
  });

  const userId = String(
    (
      await User.create({
        tenantId,
        name: "Finance User",
        email: `finance-${Date.now()}-${Math.random()}@example.com`,
        phone: "9999999999",
        password: "hashed",
        role: "finance",
        status: "active",
      })
    )._id,
  );

  const date = new Date();
  for (const je of goldenCase.journalEntries) {
    const jeDate = new Date(date.getTime() + (je.dateOffsetDays ?? 0) * 24 * 60 * 60 * 1000);
    await JournalEntry.create({
      tenantId,
      header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: jeDate, journalType: "bank" },
      voucherStatus: "posted",
      status: "posted",
      lineIds: [
        { accountId: bankAccount._id, label: je.label ?? "Payment", debit: je.amount, credit: 0, reconciled: false },
        { accountId: contraAccount._id, label: "Contra", debit: 0, credit: je.amount, reconciled: false },
      ],
    });
  }

  const partnerId = goldenCase.bankLine.withCustomerPartner
    ? (await Customer.create({ tenantId, header: { name: "Golden Customer", is_company: true }, createdBy: GOLDEN_CREATOR }))._id
    : undefined;

  const bankStatement = await BankStatement.create({
    tenantId,
    header: {
      name: `STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      journalId: bankAccount._id,
      date,
      balance_start: 0,
      balance_end_real: goldenCase.bankLine.amount,
    },
    lineIds: [{ date, payment_ref: goldenCase.bankLine.paymentRef, amount: goldenCase.bankLine.amount, partnerId, isReconciled: false }],
    status: "draft",
  });

  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-03", killSwitchEnabled: true, maxAutonomyLevel: "execute" });

  return { bankStatementId: String(bankStatement._id), userId };
}

describe("AI-03 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      BankStatement.init(),
      JournalEntry.init(),
      Customer.init(),
      User.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AiAttentionItem.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai03BankReconciliation } = await import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI03_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: GoldenCase["expected"]; actual: { autoActioned: number; titles: string[] } }[] = [];

    for (const goldenCase of AI03_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const { bankStatementId, userId } = await seedCase(tenantId, goldenCase);

      const envelope = await runWorkflow(ai03BankReconciliation, {
        tenantId,
        eventKey: "bank.transaction.imported",
        payload: { bankStatementId, actingUserId: userId },
      });

      const titles = envelope.findings.map((f) => f.title);
      const autoActionedOk = envelope.metrics.autoActioned === goldenCase.expected.autoActioned;
      const titleOk = titles.some((t) => t.includes(goldenCase.expected.findingTitleContains));
      results.push({ id: goldenCase.id, passed: autoActionedOk && titleOk, expected: goldenCase.expected, actual: { autoActioned: envelope.metrics.autoActioned, titles } });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-03 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

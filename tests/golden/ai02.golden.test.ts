import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai02golden";

// Deterministic safety net (mirrors tests/ai/aiRuntime/ai02LedgerClassification.test.ts): every
// golden case here is seeded to resolve at the BankingRule or history step, never the model step.
// This mock guarantees that even if a case unexpectedly falls through to step 3, the outcome is
// fixed (gated, no classification) rather than a live model call — see goldenCases.ts's doc
// comment for why this keeps the whole dataset 100%-checkable.
vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: vi.fn(async () => ({ tier: "starter", aiSettings: {} })),
  callClaudeForTenant: vi.fn(async () => ({ gated: true, code: "GOLDEN_DATASET_MODEL_DISABLED", error: "golden dataset — deterministic-only cases" })),
}));

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Expense from "@/models/finance/Expense";
import Customer from "@/models/sales/Customer";
import BankingRule from "@/models/finance/BankingRule";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import { AI02_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, GOLDEN_CREATOR, type GoldenCase } from "@/tests/golden/ai02/goldenCases";

/**
 * The golden-dataset CI check for AI-02 (docs/ai/BRIEF-09-VERIFICATION.md 0.3), built to the same
 * standard as `tests/golden/ai27.golden.test.ts`. Reports a PASS RATE across a named case set and
 * fails the whole run if it drops below `PASS_RATE_THRESHOLD`.
 */

const PASS_RATE_THRESHOLD = 1.0; // every golden case must pass — every case resolves via AI-02's own
// deterministic BankingRule engine or classification-history logic (never a live model call — see
// goldenCases.ts's doc comment and the tenantAi mock above), so there is no honest reason to accept
// less than 100%.

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai02LedgerClassification: typeof import("@/lib/aiRuntime/workflows/ai-02-ledger-classification").ai02LedgerClassification;

async function makeAccount(tenantId: string, name: string) {
  const acc = await Account.create({
    tenantId,
    name,
    code: `GOLD-${Math.random().toString(36).slice(2, 8)}`,
    account_type: "expense",
    internal_group: "expense",
    isActive: true,
    isLocked: false,
    status: "active",
  });
  return String(acc._id);
}

async function makeFinanceUser(tenantId: string) {
  const u = await User.create({
    tenantId,
    name: "Golden Finance User",
    email: `golden-ai02-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    phone: "9999999999",
    password: "hashed",
    role: "finance",
    status: "active",
  });
  return String(u._id);
}

interface SeededCase {
  eventKey: string;
  payload: Record<string, unknown>;
  targetAccountId?: string;
  recordModel: "Invoice" | "Expense";
  recordId: string;
}

async function seedCase(tenantId: string, goldenCase: GoldenCase): Promise<SeededCase> {
  const actingUserId = goldenCase.hasActingUser ? await makeFinanceUser(tenantId) : undefined;

  let targetAccountId: string | undefined;
  if (goldenCase.bankingRule) {
    targetAccountId = await makeAccount(tenantId, `${goldenCase.bankingRule.ruleName} Account`);
    await BankingRule.create({
      tenantId,
      ruleName: goldenCase.bankingRule.ruleName,
      applyTo: goldenCase.bankingRule.applyTo,
      criteriaMatch: goldenCase.bankingRule.criteriaMatch,
      criteria: goldenCase.bankingRule.criteria,
      recordAs: "expense",
      accountId: targetAccountId,
      createdBy: GOLDEN_CREATOR,
    });
  }

  if (goldenCase.recordModel === "Invoice") {
    const partnerId = (
      await Customer.create({ tenantId, header: { name: goldenCase.vendorName, is_company: true }, createdBy: GOLDEN_CREATOR })
    )._id as mongoose.Types.ObjectId;

    if (goldenCase.history) {
      targetAccountId = await makeAccount(tenantId, "Golden History Target Account");
      const otherAccountId = new mongoose.Types.ObjectId();
      for (let i = 0; i < goldenCase.history.matchingCount; i++) {
        await Invoice.create({
          tenantId,
          name: `GOLDEN-HIST-M-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          partnerId,
          moveType: "in_invoice",
          state: "posted",
          invoiceDate: new Date(),
          dueDate: new Date(),
          invoiceLines: [{ name: "Prior", priceSubtotal: 1000, quantity: 1, priceUnit: 1000, accountId: new mongoose.Types.ObjectId(targetAccountId) }],
          amountTotal: 1000,
        });
      }
      for (let i = 0; i < goldenCase.history.otherCount; i++) {
        await Invoice.create({
          tenantId,
          name: `GOLDEN-HIST-O-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          partnerId,
          moveType: "in_invoice",
          state: "posted",
          invoiceDate: new Date(),
          dueDate: new Date(),
          invoiceLines: [{ name: "Prior", priceSubtotal: 1000, quantity: 1, priceUnit: 1000, accountId: otherAccountId }],
          amountTotal: 1000,
        });
      }
    }

    const invoice = await Invoice.create({
      tenantId,
      name: `GOLDEN-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      partnerId,
      moveType: "in_invoice",
      state: "draft",
      invoiceDate: new Date(),
      dueDate: new Date(),
      invoiceLines: [{ name: goldenCase.description_, priceSubtotal: goldenCase.amount, quantity: 1, priceUnit: goldenCase.amount }],
      amountTotal: goldenCase.amount,
    });

    return {
      eventKey: "bill.created",
      payload: { invoiceId: String(invoice._id), ...(actingUserId ? { actingUserId } : {}) },
      targetAccountId,
      recordModel: "Invoice",
      recordId: String(invoice._id),
    };
  }

  // Expense — needs a placeholder accountId at creation (schema-required) distinct from what
  // AI-02 might later classify it to; employeeId is a required ref too.
  const employeeId = await makeFinanceUser(tenantId);
  const placeholderAccountId = await makeAccount(tenantId, "Golden Placeholder Account");
  const expense = await Expense.create({
    tenantId,
    description: goldenCase.description_,
    category: `golden-category-${goldenCase.id}`,
    total: goldenCase.amount,
    employeeId,
    accountId: placeholderAccountId,
    status: "draft",
  });

  return {
    eventKey: "expense.submitted",
    payload: { expenseId: String(expense._id), ...(actingUserId ? { actingUserId } : {}) },
    targetAccountId,
    recordModel: "Expense",
    recordId: String(expense._id),
  };
}

async function readWrittenAccountId(seeded: SeededCase): Promise<string | undefined> {
  if (seeded.recordModel === "Invoice") {
    const invoice = await Invoice.findById(seeded.recordId).lean();
    const accId = (invoice as { invoiceLines?: { accountId?: mongoose.Types.ObjectId }[] } | null)?.invoiceLines?.[0]?.accountId;
    return accId ? String(accId) : undefined;
  }
  const expense = await Expense.findById(seeded.recordId).lean();
  const accId = (expense as { accountId?: mongoose.Types.ObjectId } | null)?.accountId;
  // Expense always has SOME accountId (schema-required placeholder) — only report it as "written"
  // if it changed from the placeholder, which the caller compares against targetAccountId anyway.
  return accId ? String(accId) : undefined;
}

describe("AI-02 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      Invoice.init(),
      Expense.init(),
      Customer.init(),
      BankingRule.init(),
      User.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai02LedgerClassification } = await import("@/lib/aiRuntime/workflows/ai-02-ledger-classification"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI02_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; detail: string }[] = [];

    for (const goldenCase of AI02_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const seeded = await seedCase(tenantId, goldenCase);
      await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-02", killSwitchEnabled: true, maxAutonomyLevel: "execute" });

      const preAccountId = await readWrittenAccountId(seeded); // Expense has a placeholder value pre-run

      const envelope = await runWorkflow(ai02LedgerClassification, {
        tenantId,
        eventKey: seeded.eventKey,
        payload: seeded.payload,
      });

      const finding = envelope.findings[0];
      const actualBasis: "explicit_rule" | "history" | "none" = !finding
        ? "none"
        : finding.title.startsWith("Classified via BankingRule")
          ? "explicit_rule"
          : finding.title === "Classified from prior treatment history"
            ? "history"
            : "none";

      const postAccountId = await readWrittenAccountId(seeded);
      const accountWasWritten = seeded.recordModel === "Invoice" ? Boolean(postAccountId) : postAccountId !== preAccountId;
      const writtenAccountId = accountWasWritten ? postAccountId : undefined;

      const checks = {
        basis: actualBasis === goldenCase.expected.basis,
        accountReferenced:
          goldenCase.expected.basis === "explicit_rule"
            ? Boolean(goldenCase.expected.accountReferenced === Boolean(finding?.detail.includes(seeded.targetAccountId ?? "__none__")))
            : true, // history/none verified via the write check below instead (detail text has no id for history)
        accountWritten:
          goldenCase.expected.accountWritten === accountWasWritten &&
          (goldenCase.expected.accountWritten ? writtenAccountId === seeded.targetAccountId : true),
      };
      const passed = Object.values(checks).every(Boolean);

      results.push({
        id: goldenCase.id,
        passed,
        detail: passed
          ? ""
          : JSON.stringify({
              checks,
              expected: goldenCase.expected,
              actual: { basis: actualBasis, findingTitle: finding?.title, findingDetail: finding?.detail, writtenAccountId, targetAccountId: seeded.targetAccountId },
            }),
      });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-02 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

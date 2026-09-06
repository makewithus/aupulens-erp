import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai04golden";

import Expense from "@/models/finance/Expense";
import AiExpensePolicy from "@/models/ai/AiExpensePolicy";
import Account from "@/models/finance/Account";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import { AI04_GOLDEN_CASES, GOLDEN_TENANT_PREFIX, type Ai04GoldenCase } from "@/tests/golden/ai04/goldenCases";

/**
 * The golden-dataset CI check for AI-04 (docs/ai/BRIEF-10-PRE-QA.md P0.6). Unlike a normal test
 * (proves the code does what it did yesterday), this reports a PASS RATE across a named case set
 * and fails the whole run if it drops below `PASS_RATE_THRESHOLD` — the signal a behaviour change
 * altered real decisions, which a per-assertion test can miss if it only checks the cases it
 * happens to include.
 */

// AI-04 is fully deterministic (no LLM call anywhere — reason() always returns confidence: 1,
// confirmed by reading the workflow file), so 100% is the only honest bar — same reasoning as
// AI-27/AI-10's golden datasets.
const PASS_RATE_THRESHOLD = 1.0;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai04ExpenseIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-04-expense-intelligence").ai04ExpenseIntelligence;

async function seedAndRun(tenantId: string, goldenCase: Ai04GoldenCase): Promise<string[]> {
  const accountId = (await Account.create({ tenantId, name: "Travel Expense", code: `EXP-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true }))._id;
  if (goldenCase.policy) {
    await AiExpensePolicy.create({
      tenantId,
      categoryLimits: goldenCase.policy.categoryLimits ?? [],
      prohibitedCategories: goldenCase.policy.prohibitedCategories ?? [],
    });
  }
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-04", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

  const employeeIds = new Map<string, mongoose.Types.ObjectId>();
  let triggerId = "";
  for (const spec of goldenCase.expenses) {
    let employeeId: mongoose.Types.ObjectId;
    if (spec.employeeKey) {
      if (!employeeIds.has(spec.employeeKey)) employeeIds.set(spec.employeeKey, new mongoose.Types.ObjectId());
      employeeId = employeeIds.get(spec.employeeKey)!;
    } else {
      employeeId = new mongoose.Types.ObjectId();
    }
    const expense = await Expense.create({
      tenantId,
      description: "Golden expense",
      category: spec.category,
      total: spec.total,
      paidBy: "employee",
      expenseDate: spec.expenseDate ? new Date(spec.expenseDate) : new Date(),
      accountId,
      employeeId,
      status: "draft",
    });
    triggerId = String(expense._id);
  }

  const envelope = await runWorkflow(ai04ExpenseIntelligence, { tenantId, eventKey: "expense.submitted", payload: { expenseId: triggerId } });
  return envelope.findings
    .map((f) => f.title.replace("Expense policy: ", "").replace(/ /g, "_"))
    .sort();
}

describe("AI-04 golden dataset", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Expense.init(), AiExpensePolicy.init(), Account.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiAttentionItem.init(), AiWorkflowPolicy.init(), AiEvent.init(), AiToolCall.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai04ExpenseIntelligence } = await import("@/lib/aiRuntime/workflows/ai-04-expense-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it(`reports a pass rate >= ${PASS_RATE_THRESHOLD * 100}% across ${AI04_GOLDEN_CASES.length} golden case(s)`, async () => {
    const results: { id: string; passed: boolean; expected: string[]; actual: string[] }[] = [];

    for (const goldenCase of AI04_GOLDEN_CASES) {
      const tenantId = `${GOLDEN_TENANT_PREFIX}-${goldenCase.id}`;
      const actual = await seedAndRun(tenantId, goldenCase);
      const expected = [...goldenCase.expected.violationRules].sort();
      const passed = JSON.stringify(actual) === JSON.stringify(expected);
      results.push({ id: goldenCase.id, passed, expected, actual });
    }

    const passRate = results.filter((r) => r.passed).length / results.length;
    const failures = results.filter((r) => !r.passed);

    console.log(`AI-04 golden dataset: ${results.length - failures.length}/${results.length} passed (${Math.round(passRate * 100)}%)`, failures.length > 0 ? { failures } : "");

    expect(passRate, `golden dataset regressions: ${JSON.stringify(failures)}`).toBeGreaterThanOrEqual(PASS_RATE_THRESHOLD);
  });
});

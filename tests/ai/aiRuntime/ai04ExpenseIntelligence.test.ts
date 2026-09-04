import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai04";

import Expense from "@/models/finance/Expense";
import AiExpensePolicy from "@/models/ai/AiExpensePolicy";
import Account from "@/models/finance/Account";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai04ExpenseIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-04-expense-intelligence").ai04ExpenseIntelligence;

const TENANT = "ai04-tenant";

async function makeExpense(overrides: Partial<{ category: string; total: number; employeeId: mongoose.Types.ObjectId; expenseDate: Date }> = {}) {
  const accountId = (await Account.create({ tenantId: TENANT, name: "Travel Expense", code: `EXP-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true }))._id;
  const expense = await Expense.create({
    tenantId: TENANT,
    description: "Test expense",
    category: overrides.category ?? "travel",
    total: overrides.total ?? 500,
    paidBy: "employee",
    expenseDate: overrides.expenseDate ?? new Date(),
    accountId,
    employeeId: overrides.employeeId ?? new mongoose.Types.ObjectId(),
    status: "draft",
  });
  return String(expense._id);
}

describe("AI-04 — Expense intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Expense.init(),
      AiExpensePolicy.init(),
      Account.init(),
      User.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiAttentionItem.init(),
      AiWorkflowPolicy.init(),
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

  afterEach(async () => {
    await Promise.all([
      Expense.deleteMany({}),
      AiExpensePolicy.deleteMany({}),
      Account.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiAttentionItem.deleteMany({}),
    ]);
  });

  it("false positive (the most important test): no policy configured → pass, no violation invented", async () => {
    const expenseId = await makeExpense({ category: "travel", total: 999999 }); // absurd amount, but no policy exists
    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId },
    });

    expect(envelope.findings).toHaveLength(0);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace!.reasonChain.join(" ")).toContain("no AiExpensePolicy configured");
  });

  it("over-limit claim with a configured policy → violation, with the rule named", async () => {
    await AiExpensePolicy.create({ tenantId: TENANT, categoryLimits: [{ category: "travel", maxAmount: 1000 }], prohibitedCategories: [] });
    const expenseId = await makeExpense({ category: "travel", total: 5000 });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId },
    });

    const finding = envelope.findings.find((f) => f.title.includes("over limit"));
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("5000");

    const item = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: `AI-04:${finding!.id}` }).lean();
    expect(item).not.toBeNull();
  });

  it("prohibited category → violation named", async () => {
    await AiExpensePolicy.create({ tenantId: TENANT, categoryLimits: [], prohibitedCategories: ["entertainment"] });
    const expenseId = await makeExpense({ category: "entertainment", total: 100 });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId },
    });

    const finding = envelope.findings.find((f) => f.title.includes("prohibited"));
    expect(finding).toBeDefined();
  });

  it("a within-limit claim with a policy configured → no violation, policy_configured true", async () => {
    await AiExpensePolicy.create({ tenantId: TENANT, categoryLimits: [{ category: "travel", maxAmount: 1000 }], prohibitedCategories: [] });
    const expenseId = await makeExpense({ category: "travel", total: 200 });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId },
    });

    expect(envelope.findings).toHaveLength(0);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace!.reasonChain.join(" ")).toContain("policy configured");
  });

  it("duplicate claim by the same employee (same amount, within a day) → detected regardless of policy configuration", async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const date = new Date();
    await makeExpense({ category: "meals", total: 300, employeeId, expenseDate: date });
    const secondId = await makeExpense({ category: "meals", total: 300, employeeId, expenseDate: date });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId: secondId },
    });

    const finding = envelope.findings.find((f) => f.title.includes("duplicate"));
    expect(finding).toBeDefined();
  });

  it("idempotency: the same trigger event twice produces exactly one run", async () => {
    const AiEvent = (await import("@/models/ai/AiEvent")).default;
    const expenseId = await makeExpense();
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "expense.submitted", payload: { expenseId } });
    const triggerEvent = { id: String(event._id), tenantId: TENANT, eventKey: "expense.submitted", payload: { expenseId } };

    const first = await runWorkflow(ai04ExpenseIntelligence, triggerEvent);
    const second = await runWorkflow(ai04ExpenseIntelligence, triggerEvent);

    expect(second.runId).toBe(first.runId);
    const runCount = await AiWorkflowRun.countDocuments({ workflowId: "AI-04" });
    expect(runCount).toBe(1);
    await AiEvent.deleteMany({});
  });
});

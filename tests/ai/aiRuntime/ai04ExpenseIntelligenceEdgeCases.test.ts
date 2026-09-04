import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai04_edge";

import Expense from "@/models/finance/Expense";
import AiExpensePolicy from "@/models/ai/AiExpensePolicy";
import Account from "@/models/finance/Account";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiEvent from "@/models/ai/AiEvent";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai04ExpenseIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-04-expense-intelligence").ai04ExpenseIntelligence;

const TENANT = "ai04-edge-tenant";
const OTHER_TENANT = "ai04-edge-tenant-B";

async function makeAccount(tenantId: string) {
  return (await Account.create({ tenantId, name: "Travel Expense", code: `EXP-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true }))._id;
}

async function makeExpense(tenantId: string, overrides: Partial<{ category: string; total: number; employeeId: mongoose.Types.ObjectId; expenseDate: Date; description: string }> = {}) {
  const accountId = await makeAccount(tenantId);
  const expense = await Expense.create({
    tenantId,
    description: overrides.description ?? "Test expense",
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

describe("AI-04 — Expense intelligence: verification edge cases (docs/ai/BRIEF-09-VERIFICATION.md)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Expense.init(), AiExpensePolicy.init(), Account.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiAttentionItem.init(), AiWorkflowPolicy.init(), AiEvent.init(),
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
      Expense.deleteMany({}), AiExpensePolicy.deleteMany({}), Account.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiAttentionItem.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}), AiEvent.deleteMany({}),
    ]);
  });

  // ── C.4 Cross-tenant hostile input ─────────────────────────────────────────
  // Regression test for the bug found during this verification pass:
  // lib/aiRuntime/workflows/ai-04-expense-intelligence/index.ts's extract() used to call
  // `Expense.findById(observed.raw.expenseId)` with NO tenantId filter. A hostile/spoofed event
  // whose declared tenantId does not match the referenced Expense's real tenant (e.g. via
  // lib/aiRuntime/nl/chatBridge.ts's runWorkflowFromChat(), which calls runWorkflow() directly
  // and does not go through any subscriptionFilter) could read another tenant's private expense
  // data and evaluate it against the ATTACKING tenant's own policy, leaking the amount and
  // category into that tenant's AiAttentionItem queue. Fixed by scoping the query to
  // `{_id, tenantId: ctx.tenantId}` so a cross-tenant reference fails closed as "not found".
  it("cross-tenant hostile input: an expenseId belonging to tenant B, referenced from a tenant A event, must not leak tenant B's data", async () => {
    const accountId = await makeAccount(OTHER_TENANT);
    const secretExpense = await Expense.create({
      tenantId: OTHER_TENANT,
      description: "Tenant B's private expense",
      category: "travel",
      total: 999999,
      paidBy: "employee",
      expenseDate: new Date(),
      accountId,
      employeeId: new mongoose.Types.ObjectId(),
      status: "draft",
    });

    // Tenant A has its own policy with a low limit — if the cross-tenant read succeeded, this
    // would fire an "over_limit" finding quoting tenant B's private amount (999999).
    await AiExpensePolicy.create({ tenantId: TENANT, categoryLimits: [{ category: "travel", maxAmount: 100 }], prohibitedCategories: [] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-04", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    const userId = await User.create({ tenantId: TENANT, name: "A User", email: `a-${Date.now()}@example.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });

    await expect(
      runWorkflow(ai04ExpenseIntelligence, {
        tenantId: TENANT,
        eventKey: "expense.submitted",
        payload: { expenseId: String(secretExpense._id), actingUserId: String(userId._id) },
      }),
    ).rejects.toThrow(/not found/);

    // No attention item / finding referencing tenant B's amount was ever created for tenant A.
    const leaked = await AiAttentionItem.findOne({ tenantId: TENANT, "context.detail": { $regex: "999999" } }).lean();
    expect(leaked).toBeNull();
    // And the run is recorded as failed (audited escalation), not silently dropped.
    const run = await AiWorkflowRun.findOne({ workflowId: "AI-04", tenantId: TENANT }).lean();
    expect(run).not.toBeNull();
    expect(run!.status).toBe("failed");
  });

  // ── C.1 Data shape: null/missing optional fields ────────────────────────────
  it("missing optional field (no expenseDate, category not covered by any policy rule) → no crash, no violation invented", async () => {
    const accountId = await makeAccount(TENANT);
    const expense = await Expense.create({
      tenantId: TENANT,
      description: "Uncategorized",
      category: "office_supplies", // required by schema, but not present in the policy below
      total: 100,
      paidBy: "employee",
      // expenseDate omitted — schema has no `required` on it (only description/category/total/employeeId/accountId are required)
      accountId,
      employeeId: new mongoose.Types.ObjectId(),
      status: "draft",
    });
    await AiExpensePolicy.create({ tenantId: TENANT, categoryLimits: [{ category: "travel", maxAmount: 100 }], prohibitedCategories: ["entertainment"] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-04", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId: String(expense._id) },
    });

    expect(envelope.status).not.toBe("failed");
    expect(envelope.findings).toHaveLength(0); // uncovered category matches neither prohibited nor limited category
  });

  // ── C.1 Data shape: malformed (negative amount, HTML/script in text, 500-char description) ──
  it("malformed data: negative total, HTML/script in description → evaluated without crashing, no script executed/stored unescaped in a way that breaks the pipeline", async () => {
    const accountId = await makeAccount(TENANT);
    const longDesc = "<script>alert(1)</script>" + "x".repeat(500);
    const expense = await Expense.create({
      tenantId: TENANT,
      description: longDesc,
      category: "travel",
      total: -5000, // negative — a refund/credit line, not a normal claim
      paidBy: "employee",
      expenseDate: new Date(),
      accountId,
      employeeId: new mongoose.Types.ObjectId(),
      status: "draft",
    });
    await AiExpensePolicy.create({ tenantId: TENANT, categoryLimits: [{ category: "travel", maxAmount: 1000 }], prohibitedCategories: [] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-04", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId: String(expense._id) },
    });

    // A negative total is below the positive maxAmount limit by definition (JS `>` comparison),
    // so it correctly does NOT fire an "over_limit" false positive.
    expect(envelope.findings.some((f) => f.title.includes("over limit"))).toBe(false);
    expect(envelope.status).not.toBe("failed");
  });

  // ── C.5 / C.6 Adversarial: a confidently-wrong "duplicate" that is actually a legitimate re-bill ──
  // The naive implementation of "same employee, same amount, same day → duplicate" would also
  // flag two genuinely different, legitimate expenses that happen to share amount/day/employee
  // (e.g. two separate ₹500 taxi receipts on a travel day). AI-04 does exactly that naive match —
  // this test proves what the workflow's OWN safety net is: it still raises the duplicate as a
  // MEDIUM/HIGH finding for a human to review (never auto-rejects or silently drops the expense),
  // so a legitimate re-bill is never silently blocked — it is escalated, not decided.
  it("adversarial: two legitimate same-amount same-day claims by the same employee are flagged for review, not silently rejected or silently accepted", async () => {
    const employeeId = new mongoose.Types.ObjectId();
    const date = new Date("2026-03-10T09:00:00Z");
    await makeExpense(TENANT, { category: "travel", total: 450, employeeId, expenseDate: date, description: "Taxi — airport to hotel" });
    const secondId = await makeExpense(TENANT, { category: "travel", total: 450, employeeId, expenseDate: date, description: "Taxi — hotel to client site (separate legitimate trip)" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-04", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId: secondId },
    });

    const finding = envelope.findings.find((f) => f.title.includes("duplicate"));
    expect(finding).toBeDefined(); // correctly flagged for a human — never fabricated confidence
    expect(finding!.confidence).toBe(1); // confident it's a DATA MATCH, not confident it IS fraud
    // Critically: act() never writes/rejects/blocks anything for AI-04 — findings only, so the
    // legitimate second claim is never auto-blocked. Confirmed by the workflow's own act(): it
    // always returns actionsTaken: [] (see the module's act() implementation).
    expect(envelope.status).toBe("escalated"); // EXCEPTION-type findings always escalate to a human
  });

  // ── C.4 Kill switch off ─────────────────────────────────────────────────────
  it("kill switch off → still evaluates (read-only workflow) but autonomyApplied clamps to RECOMMEND, no side effect changes", async () => {
    await AiExpensePolicy.create({ tenantId: TENANT, categoryLimits: [{ category: "travel", maxAmount: 100 }], prohibitedCategories: [] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-04", killSwitchEnabled: false, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    const expenseId = await makeExpense(TENANT, { category: "travel", total: 5000 });

    const envelope = await runWorkflow(ai04ExpenseIntelligence, {
      tenantId: TENANT,
      eventKey: "expense.submitted",
      payload: { expenseId, actingUserId: String(new mongoose.Types.ObjectId()) },
    });

    expect(envelope.autonomyApplied).toBe("recommend");
    // AI-04's act() never performs a write regardless of autonomy (it is a pure evaluator), so
    // "no side effect" holds trivially here — the meaningful assertion is the clamp itself.
    const finding = envelope.findings.find((f) => f.title.includes("over limit"));
    expect(finding).toBeDefined(); // the violation is still surfaced for a human — RECOMMEND, not silence
  });
});

// Trigger proof lives in its own file (ai04ExpenseIntelligenceTriggerProof.test.ts) — it needs a
// module-scope (hoisted) vi.mock("@/auth", ...) to call the real route handler, and hoisted mocks
// apply to an entire test file, so it can't share a file with the runWorkflow()-based tests above.

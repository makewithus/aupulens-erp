import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai04_trigger";

// Hoisted (module-scope) auth mock — Vitest hoists vi.mock() above all imports, so the route
// module (which imports `auth` from "@/auth" at its own top level) sees the mock from the very
// first import, with no vi.resetModules()/dynamic-import gymnastics needed. Everything else
// (Expense, Account, AiWorkflowRun, the AI runtime itself) is the REAL implementation against a
// real local MongoDB — only the session is faked, exactly the way a real signed-in request would
// look to the route.
const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import Expense from "@/models/finance/Expense";
import Account from "@/models/finance/Account";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let POST: typeof import("@/app/api/finance/expenses/route").POST;

const TENANT = "ai04-trigger-tenant";

describe("AI-04 — trigger proof: fires from the REAL /api/finance/expenses POST route (docs/ai/BRIEF-09-VERIFICATION.md Part B.1)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Expense.init(), Account.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiWorkflowPolicy.init()]);
    // Dynamic imports, deferred until after MONGODB_URI is set above — lib/db.ts throws at
    // MODULE LOAD time if it's unset, and a static top-level `import` of the route (which
    // transitively imports lib/db.ts) would be hoisted before the process.env assignment runs.
    const { bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap");
    ({ POST } = await import("@/app/api/finance/expenses/route"));
    bootstrapAiRuntime();
    mockAuth.mockResolvedValue({ user: { id: String(new mongoose.Types.ObjectId()), tenantId: TENANT, role: "finance" } });
    // AI-04's defaultAutonomy is DRAFT (above RECOMMEND), so the eventBus's dispatch requires
    // the per-tenant kill switch on to dispatch at all (Hard Rule 6, fail-closed) — a validated
    // tenant, exactly like production, not the "never configured" case.
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-04", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("POST /api/finance/expenses (the ordinary business action, not runWorkflow() called directly) creates the Expense and AI-04 fires as a real side effect", async () => {
    const accountId = (await Account.create({ tenantId: TENANT, name: "Meals", code: `EXP-T-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true }))._id;

    const req = {
      json: () =>
        Promise.resolve({
          description: "Client dinner",
          category: "meals",
          total: 2500,
          paidBy: "employee",
          expenseDate: new Date().toISOString(),
          accountId: String(accountId),
        }),
    } as any;

    const res = await POST(req);
    const body = await res.json();
    expect(body.success, JSON.stringify(body)).toBe(true);
    const expenseId = String(body.expense._id);

    // The route's safeEmitEvent() call is awaited inline (see lib/aiRuntime/runtime/safeEmit.ts)
    // so by the time POST() resolves, AI-04's run has completed — no polling/sleep needed.
    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-04", entityId: expenseId }).lean();
    expect(run, "AI-04 did not fire from the real POST /api/finance/expenses route").not.toBeNull();
    expect(run!.status).not.toBe("failed");

    const trace = await AiDecisionTrace.findOne({ runId: String(run!._id) }).lean();
    expect(trace, "the run has no audited decision trace").not.toBeNull();
  });
});

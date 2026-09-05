import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai13_edge";

import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import PeriodClosing from "@/models/finance/PeriodClosing";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiCloseState from "@/models/ai/AiCloseState";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import User from "@/models/auth/User";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai13DayZeroClose: typeof import("@/lib/aiRuntime/workflows/ai-13-day-zero-close").ai13DayZeroClose;

const TENANT = "ai13-edge-tenant";

async function makeAccount(tenantId: string, account_type: string) {
  const acc = await Account.create({ tenantId, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}
async function makeUser(tenantId: string) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

describe("AI-13 — Day Zero Close: verification edge cases (docs/ai/BRIEF-09-VERIFICATION.md)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), BankStatement.init(), JournalEntry.init(), PeriodClosing.init(),
      AiMaterialityPolicy.init(), AiCloseState.init(), AiWorkflowRun.init(), AiDecisionTrace.init(),
      AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), User.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai13DayZeroClose } = await import("@/lib/aiRuntime/workflows/ai-13-day-zero-close"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), BankStatement.deleteMany({}), JournalEntry.deleteMany({}), PeriodClosing.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}), AiCloseState.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), User.deleteMany({}),
    ]);
  });

  // ── C.2 / C.4 defect class 2: unvalidated period.horizon.reached payload ──────────────────
  it("malformed event.payload.period ('garbage', not YYYY-MM) never reaches Date.UTC as NaN — no uncaught Mongoose CastError (regression, this workflow's own §9 bug)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai13DayZeroClose, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "garbage" } });
    expect(envelope.status).not.toBe("failed");
    // Falls back to the current calendar month, computed and persisted cleanly.
    const now = new Date();
    const expectedPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const state = await AiCloseState.findOne({ tenantId: TENANT, period: expectedPeriod }).lean();
    expect(state).not.toBeNull();
  });

  it("empty-string and missing period both default safely too (not just falsy vs malformed-truthy)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const e1 = await runWorkflow(ai13DayZeroClose, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "" } });
    const e2 = await runWorkflow(ai13DayZeroClose, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    expect(e1.status).not.toBe("failed");
    expect(e2.status).not.toBe("failed");
  });

  // ── C.4 cross-tenant hostile input (defect class 1: unscoped findById on a payload id) ────
  it("no externally-supplied id from the event payload is ever resolved via an unscoped DB read — AI-13 takes no subject id at all, only a period string (structural, source-grep)", () => {
    const output = execSync(String.raw`grep -n "findById" lib/aiRuntime/workflows/ai-13-day-zero-close/index.ts lib/aiRuntime/closeReadiness/*.ts || true`, { cwd: process.cwd(), encoding: "utf-8" });
    expect(output.trim()).toBe("");
  });

  // ── C.3 concurrent duplicate event ─────────────────────────────────────────────────────────
  it("the same triggerEventId fired concurrently twice still produces exactly one AiWorkflowRun and one AiCloseState (persistent idempotency holds; the executor's own duplicate-key race on the losing caller is a known, reported executor-level gap — see this record's §9)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const eventId = new mongoose.Types.ObjectId();
    const event = { id: String(eventId), tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString() } };
    const results = await Promise.allSettled([runWorkflow(ai13DayZeroClose, event), runWorkflow(ai13DayZeroClose, event)]);
    // At least one resolves cleanly; the underlying persisted state is exactly one run/state,
    // never two and never a partial one — the correctness guarantee C.3 actually asks for.
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const runCount = await AiWorkflowRun.countDocuments({ tenantId: TENANT, workflowId: "AI-13", triggerEventId: eventId });
    expect(runCount).toBe(1);
    const stateCount = await AiCloseState.countDocuments({ tenantId: TENANT, period: "2026-01" });
    expect(stateCount).toBe(1);
  });

  // ── C.1 Large volume: 10k+ journal entries, correctness + timing ──────────────────────────
  it("large volume: 10,000 posted journal entries recompute correctly within a generous dev-box budget (C.1 Large; shared-machine timing per docs/ai/UI_REGRESSION.md)", async () => {
    const bankAccountId = await makeAccount(TENANT, "asset_cash");
    const expenseAccountId = await makeAccount(TENANT, "expense");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT-BULK", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 500000 }, lineIds: [], status: "draft" });

    const bulk = Array.from({ length: 10000 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `JE-BULK-${i}`, date: new Date("2026-01-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: bankAccountId, label: "bulk", debit: 50, credit: 0 },
        { accountId: expenseAccountId, label: "bulk", debit: 0, credit: 50 },
      ],
      totals: { amountUntaxed: 50, amountTax: 0, amountTotal: 50 },
    }));
    await JournalEntry.insertMany(bulk);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runWorkflow(ai13DayZeroClose, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString() } });
    const elapsedMs = Date.now() - start;

    expect(envelope.status).not.toBe("failed");
    const state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    expect(state).not.toBeNull();
    // 10,000 x 50 = 500,000, exactly matching the bank statement's ending balance -> reconciled.
    const bank = state!.domains.find((d) => d.domain === "bank");
    expect(bank!.status).not.toBe("blocked");
    expect(elapsedMs).toBeLessThan(30000);
  }, 40000);

  // ── C.6 Adversarial: a PeriodClosing marked reconciled by a human while the underlying data
  //      quietly regresses AFTER that manual sign-off must still surface, not go silent ───────
  it("adversarial: PeriodClosing signed off as reconciled, then a new material gap appears afterward — still flagged as a contradiction on the next recompute, not accepted as final", async () => {
    const bankAccountId = await makeAccount(TENANT, "asset_cash");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 5000 }, lineIds: [], status: "draft" });
    const userId = await makeUser(TENANT);
    await PeriodClosing.create({ tenantId: TENANT, name: "2026-01", fiscalYear: 2026, month: 1, status: "reconciled", createdBy: userId });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai13DayZeroClose, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString() } });
    // A confidently-wrong answer here would be silently trusting the human's "reconciled" label.
    const finding = envelope.findings.find((f) => f.title.includes("contradicted"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("critical");
  });
});

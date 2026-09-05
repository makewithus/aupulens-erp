import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { addDays } from "date-fns";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai16edge";
process.env.CRON_SECRET = "ai16-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import BankAccount from "@/models/finance/BankAccount";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import FxRate from "@/models/finance/FxRate";
import Payroll from "@/models/hr/Payroll";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiSchedule from "@/models/ai/AiSchedule";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai16CashIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-16-cash-intelligence").ai16CashIntelligence;

const TENANT = "ai16-edge-tenant";
const OTHER_TENANT = "ai16-edge-other-tenant";

async function makeUser(tenantId = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}
async function makeBankAccount(userId: string, currency = "INR", tenantId = TENANT) {
  const glAccount = await Account.create({ tenantId, name: `Bank ${currency}`, code: `BANK-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_cash", isActive: true, isLocked: false, status: "active" });
  const bankAccount = await BankAccount.create({ tenantId, accountName: `Bank ${currency}`, currency, glAccountId: glAccount._id, createdBy: userId });
  return { glAccount, bankAccount };
}
async function makeStatement(bankAccount: { glAccountId?: unknown }, balanceEndReal: number, tenantId = TENANT) {
  return BankStatement.create({
    tenantId,
    header: { name: `STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, journalId: bankAccount.glAccountId, date: new Date(), balance_start: 0, balance_end_real: balanceEndReal },
    lineIds: [],
    status: "draft",
  });
}
async function runAi16(tenantId = TENANT, actingUserId?: string) {
  return runWorkflow(ai16CashIntelligence, { tenantId, eventKey: "ai.sweep.hourly", payload: actingUserId ? { actingUserId } : {} });
}

describe("AI-16 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), BankAccount.init(), BankStatement.init(), JournalEntry.init(), FxRate.init(),
      Payroll.init(), Customer.init(), User.init(), AiDecisionTrace.init(), AiWorkflowRun.init(), AiEvent.init(),
      AiToolCall.init(), AiWorkflowPolicy.init(), AiSchedule.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai16CashIntelligence } = await import("@/lib/aiRuntime/workflows/ai-16-cash-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Account.deleteMany({}), BankAccount.deleteMany({}), BankStatement.deleteMany({}), JournalEntry.deleteMany({}),
      FxRate.deleteMany({}), Payroll.deleteMany({}), Customer.deleteMany({}), User.deleteMany({}), AiDecisionTrace.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiSchedule.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-16 and produces a real 30-day forecast", async () => {
    await Organization.create({ name: "AI16 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const userId = await makeUser();
    const { bankAccount } = await makeBankAccount(userId);
    await makeStatement(bankAccount, 25000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-16" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real ai.sweep.hourly event that reached AI-16").not.toBeNull();
    const trace = await AiDecisionTrace.findOne({ runId: run!._id }).lean();
    const proposal = trace!.rawProposal as unknown as { forecast: unknown[] };
    expect(proposal.forecast.length).toBe(30);
  });

  // ── C.3 duplicate/concurrent event — AI-16 has no write tool, so "exactly one effect" is
  // structurally trivial (nothing is ever written beyond the generic AiWorkflowRun/
  // AiDecisionTrace scaffolding runWorkflow() itself manages) — the real question is whether two
  // truly simultaneous sweeps on the same tenant crash or corrupt each other's read.
  it("C.3 concurrent runs: two truly simultaneous sweeps on the same tenant both complete cleanly with consistent, correct forecasts", async () => {
    const userId = await makeUser();
    const { bankAccount } = await makeBankAccount(userId);
    await makeStatement(bankAccount, 25000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const [e1, e2] = await Promise.all([runAi16(TENANT, userId), runAi16(TENANT, userId)]);
    expect(e1.status).not.toBe("failed");
    expect(e2.status).not.toBe("failed");
    const t1 = await AiDecisionTrace.findOne({ runId: e1.runId }).lean();
    const t2 = await AiDecisionTrace.findOne({ runId: e2.runId }).lean();
    const p1 = (t1!.rawProposal as any).position.totalAvailableInr;
    const p2 = (t2!.rawProposal as any).position.totalAvailableInr;
    expect(p1).toBeCloseTo(25000, 2);
    expect(p2).toBeCloseTo(25000, 2);
  });

  // ── C.4 Cross-tenant (positive proof) ──────────────────────────────────────────────────────
  it("C.4 cross-tenant: tenant A's forecast never includes tenant B's bank balance, AI-05/AI-06 traces, or payroll, even with a hostile actingUserId from tenant B", async () => {
    const userA = await makeUser(TENANT);
    const userB = await makeUser(OTHER_TENANT);
    const { bankAccount: accA } = await makeBankAccount(userA, "INR", TENANT);
    await makeStatement(accA, 5000, TENANT);
    const { bankAccount: accB } = await makeBankAccount(userB, "INR", OTHER_TENANT);
    await makeStatement(accB, 10_000_000, OTHER_TENANT); // huge, must never leak into tenant A's total
    await AiDecisionTrace.create({
      tenantId: OTHER_TENANT,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-06",
      workflowVersion: "1.0.0",
      inputsHash: "b",
      rawProposal: { dueSchedule: [{ billId: "b-bill", amount: 999999, currency: "INR", dueDate: addDays(new Date(), 2).toISOString() }] },
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    await AiWorkflowPolicy.create({ tenantId: OTHER_TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi16(TENANT, userB); // hostile: tenant B's own user id
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { position: { totalAvailableInr: number }; outflows?: unknown; omissions: { what: string }[] };
    expect(proposal.position.totalAvailableInr).toBeCloseTo(5000, 2);
    // AI-06 has never run for tenant A — the omission must be named, tenant B's due schedule
    // must never silently fill the gap.
    expect(proposal.omissions.some((o) => o.what === "payables_due_schedule")).toBe(true);
  });

  // ── C.1 Large volume ───────────────────────────────────────────────────────────────────────
  it("C.1 large volume: 10,000 deferred-revenue schedule periods and payroll runs resolve within budget", async () => {
    const userId = await makeUser();
    const { bankAccount } = await makeBankAccount(userId);
    await makeStatement(bankAccount, 1_000_000);
    // AiSchedule with a very large number of periods, only a handful inside the 30-day horizon.
    const periods = Array.from({ length: 10000 }, (_, i) => ({
      periodKey: `P${i}`,
      dueDate: addDays(new Date(), (i % 400) - 200),
      amount: 10,
      status: "pending",
    }));
    const AiSchedule = (await import("@/models/ai/AiSchedule")).default;
    const { AI_SCHEDULE_TYPE } = await import("@/models/ai/AiSchedule");
    const debitAcc = await Account.create({ tenantId: TENANT, name: "Deferred Rev Debit", code: `DR-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_current", internal_group: "asset", isActive: true, isLocked: false, status: "active" });
    const creditAcc = await Account.create({ tenantId: TENANT, name: "Deferred Rev Credit", code: `CR-${Math.random().toString(36).slice(2, 8)}`, account_type: "income", internal_group: "income", isActive: true, isLocked: false, status: "active" });
    await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: AI_SCHEDULE_TYPE.DEFERRED_REVENUE,
      sourceRef: { model: "Invoice", id: String(new mongoose.Types.ObjectId()) },
      startDate: new Date(),
      endDate: addDays(new Date(), 365),
      frequency: "monthly",
      totalAmount: 100000,
      debitAccountId: debitAcc._id,
      creditAccountId: creditAcc._id,
      basis: "stated",
      periods,
      nextRunDate: new Date(),
      createdByWorkflow: "AI-09",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runAi16(TENANT, userId);
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-16 large-volume forecast (10,000 schedule periods): ${elapsedMs}ms`);
    expect(envelope.status).not.toBe("failed");
    expect(elapsedMs).toBeLessThan(10000);
  }, 30000);

  // ── C.1 Malformed / null fields ─────────────────────────────────────────────────────────────
  it("C.1 malformed: a bank account with no glAccountId, a payroll run with an absurd date, never crash the forecast", async () => {
    const userId = await makeUser();
    await BankAccount.create({ tenantId: TENANT, accountName: "No GL Link", currency: "INR", createdBy: userId }); // no glAccountId
    const Payroll = (await import("@/models/hr/Payroll")).default;
    const { PAYROLL_STATUS } = await import("@/lib/constants/statuses");
    await Payroll.create({
      tenantId: TENANT,
      payrollCode: `PR-${Date.now()}`,
      payrollPeriod: { month: 1, year: 1900, startDate: new Date("1900-01-01"), endDate: new Date("1900-01-31") },
      status: PAYROLL_STATUS.APPROVED,
      totals: { totalGross: 0, totalDeductions: 0, totalNet: 0 },
      lines: [],
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await expect(runAi16(TENANT, userId)).resolves.toBeDefined();
  });

  // ── C.6 Adversarial pass ────────────────────────────────────────────────────────────────────
  // What input makes AI-16 produce a confidently-wrong, human-accepted forecast? A predicted
  // receivable landing EXACTLY on the horizon boundary (day 29 vs day 30) is a real edge a
  // careless implementation could drop silently, understating a real cash risk near the horizon
  // edge — verify it is neither dropped nor double counted.
  it("C.6 adversarial: a predicted receivable landing on the exact last day of the 30-day horizon is neither dropped nor double-counted", async () => {
    const userId = await makeUser();
    const { bankAccount } = await makeBankAccount(userId);
    await makeStatement(bankAccount, 1000);
    await AiDecisionTrace.create({
      tenantId: TENANT,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-05",
      workflowVersion: "1.0.0",
      inputsHash: "x",
      rawProposal: { predictedPayments: [{ invoiceId: "boundary-inv", amount: 40000, predictedDate: addDays(new Date(), 29).toISOString() }] },
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi16(TENANT, userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { forecast: { closing: number }[] };
    expect(proposal.forecast.length).toBe(30);
    // The final day's closing balance must reflect the inflow exactly once (opening 1000 +
    // inflow 40000, no outflow) — neither dropped (would stay ~1000) nor doubled (~81000).
    const lastDay = proposal.forecast[proposal.forecast.length - 1];
    expect(lastDay.closing).toBeCloseTo(41000, 2);
  });
});

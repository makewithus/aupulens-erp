import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";
import { addDays } from "date-fns";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai16";

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

const TENANT = "ai16-tenant";

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeBankAccount(userId: string, currency: string = "INR") {
  const glAccount = await Account.create({ tenantId: TENANT, name: `Bank ${currency}`, code: `BANK-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_cash", isActive: true, isLocked: false, status: "active" });
  const bankAccount = await BankAccount.create({ tenantId: TENANT, accountName: `Bank ${currency}`, currency, glAccountId: glAccount._id, createdBy: userId });
  return { glAccount, bankAccount };
}

// Takes the BankAccount document (not its own _id) — a statement's header.journalId matches the
// GL Account (BankAccount.glAccountId), the same real linkage AI-13's fixtures use.
async function makeStatement(bankAccount: { glAccountId?: unknown }, balanceEndReal: number) {
  return BankStatement.create({
    tenantId: TENANT,
    header: { name: `STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, journalId: bankAccount.glAccountId, date: new Date(), balance_start: 0, balance_end_real: balanceEndReal },
    lineIds: [],
    status: "draft",
  });
}

async function runAi16(actingUserId?: string) {
  return runWorkflow(ai16CashIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: actingUserId ? { actingUserId } : {} });
}

describe("AI-16 — Cash intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      BankAccount.init(),
      BankStatement.init(),
      JournalEntry.init(),
      FxRate.init(),
      Payroll.init(),
      Customer.init(),
      User.init(),
      AiDecisionTrace.init(),
      AiWorkflowRun.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AiSchedule.init(),
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
      Account.deleteMany({}),
      BankAccount.deleteMany({}),
      BankStatement.deleteMany({}),
      JournalEntry.deleteMany({}),
      FxRate.deleteMany({}),
      Payroll.deleteMany({}),
      Customer.deleteMany({}),
      User.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      AiSchedule.deleteMany({}),
    ]);
  });

  it("AI-16 never calls any tool — cannot initiate a payment or any other action (source-grep)", () => {
    const output = execSync(String.raw`grep -rn 'rt\.callTool' lib/aiRuntime/workflows/ai-16-cash-intelligence || true`, { cwd: process.cwd(), encoding: "utf-8" });
    expect(output.trim()).toBe("");
  });

  it("opening + inflows - outflows = closing, exactly, every day of the horizon, on a multi-event fixture", async () => {
    const userId = await makeUser();
    const { bankAccount } = await makeBankAccount(userId);
    await makeStatement(bankAccount, 100000);
    // Seed AI-05/AI-06 traces directly (AI-16 reads their most recent output, never recomputes).
    await AiDecisionTrace.create({
      tenantId: TENANT,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-05",
      workflowVersion: "1.0.0",
      inputsHash: "x",
      rawProposal: { predictedPayments: [{ invoiceId: "inv1", amount: 20000, predictedDate: addDays(new Date(), 5).toISOString() }] },
      confidenceComponents: {},
      finalizedAt: new Date(),
    });
    await AiDecisionTrace.create({
      tenantId: TENANT,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-06",
      workflowVersion: "1.0.0",
      inputsHash: "x",
      rawProposal: { dueSchedule: [{ billId: "bill1", amount: 15000, currency: "INR", dueDate: addDays(new Date(), 3).toISOString() }] },
      confidenceComponents: {},
      finalizedAt: new Date(),
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi16(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { forecast: { opening: number; inflows: number; outflows: number; closing: number }[] };

    expect(proposal.forecast.length).toBe(30);
    for (const day of proposal.forecast) {
      expect(day.closing).toBeCloseTo(day.opening + day.inflows - day.outflows, 5);
    }
    // Continuity: each day's opening equals the previous day's closing.
    for (let i = 1; i < proposal.forecast.length; i++) {
      expect(proposal.forecast[i].opening).toBeCloseTo(proposal.forecast[i - 1].closing, 5);
    }
  });

  it("a predicted shortfall raises a risk", async () => {
    const userId = await makeUser();
    const { bankAccount } = await makeBankAccount(userId);
    await makeStatement(bankAccount, 1000); // very little cash on hand
    await AiDecisionTrace.create({
      tenantId: TENANT,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-06",
      workflowVersion: "1.0.0",
      inputsHash: "x",
      rawProposal: { dueSchedule: [{ billId: "bill1", amount: 50000, currency: "INR", dueDate: addDays(new Date(), 2).toISOString() }] },
      confidenceComponents: {},
      finalizedAt: new Date(),
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi16(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { risks: { shortfall: number }[] };
    expect(proposal.risks.some((r) => r.shortfall > 0)).toBe(true);
  });

  it("mixed currency without a rate reports incomplete, never a wrong total", async () => {
    const userId = await makeUser();
    const { bankAccount: inrAccount } = await makeBankAccount(userId, "INR");
    await makeStatement(inrAccount, 50000);
    const { bankAccount: usdAccount } = await makeBankAccount(userId, "USD");
    await makeStatement(usdAccount, 1000); // no FxRate seeded
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi16(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { position: { totalAvailableInr: number; incompleteReason: string | null; byCurrency: { currency: string; hasRateToInr: boolean }[] } };

    expect(proposal.position.incompleteReason).not.toBeNull();
    expect(proposal.position.totalAvailableInr).toBeCloseTo(50000, 2); // USD leg excluded, never guessed into the total
    const usdLeg = proposal.position.byCurrency.find((c) => c.currency === "USD");
    expect(usdLeg?.hasRateToInr).toBe(false);
  });

  it("mixed currency WITH a rate is folded into the total correctly", async () => {
    const userId = await makeUser();
    const { bankAccount: inrAccount } = await makeBankAccount(userId, "INR");
    await makeStatement(inrAccount, 50000);
    const { bankAccount: usdAccount } = await makeBankAccount(userId, "USD");
    await makeStatement(usdAccount, 1000);
    await FxRate.create({ tenantId: TENANT, fromCurrency: "USD", toCurrency: "INR", rateDate: new Date(), rate: 83, source: "manual" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi16(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { position: { totalAvailableInr: number; incompleteReason: string | null } };

    expect(proposal.position.incompleteReason).toBeNull();
    expect(proposal.position.totalAvailableInr).toBeCloseTo(50000 + 1000 * 83, 2);
  });

  it("false positive: a tenant with comfortable headroom produces no risks", async () => {
    const userId = await makeUser();
    const { bankAccount } = await makeBankAccount(userId);
    await makeStatement(bankAccount, 10_000_000); // ample cash
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-16", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi16(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { risks: unknown[] };
    expect(proposal.risks.length).toBe(0);
  });
});

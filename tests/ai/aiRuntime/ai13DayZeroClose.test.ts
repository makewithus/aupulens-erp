import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai13";

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

const TENANT = "ai13-tenant";

async function makeAccount(account_type: string) {
  const acc = await Account.create({ tenantId: TENANT, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeBankStatement(accountId: string, balanceEndReal: number) {
  const stmt = await BankStatement.create({
    tenantId: TENANT,
    header: { name: `STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, journalId: accountId, date: new Date(), balance_start: 0, balance_end_real: balanceEndReal },
    lineIds: [],
    status: "draft",
  });
  return String(stmt._id);
}

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function runAi13() {
  return runWorkflow(ai13DayZeroClose, {
    tenantId: TENANT,
    eventKey: "period.horizon.reached",
    payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString() },
  });
}

describe("AI-13 — Day Zero Close", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      BankStatement.init(),
      JournalEntry.init(),
      PeriodClosing.init(),
      AiMaterialityPolicy.init(),
      AiCloseState.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      User.init(),
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
      Account.deleteMany({}),
      BankStatement.deleteMany({}),
      JournalEntry.deleteMany({}),
      PeriodClosing.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
      AiCloseState.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  it("zero writes to PeriodClosing from AI-13's folder (source-grep, A.2 / Hard Rule 4)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-13-day-zero-close || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("a material unreconciled bank difference (materiality configured) → blocked", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    await makeBankStatement(bankAccountId, 50000); // no GL entries at all — a real, material gap
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi13();

    const state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    expect(state).not.toBeNull();
    expect(state!.readiness.status).toBe("blocked");
    void envelope;
  });

  it("resolving the gap in the data clears the blocker on the next recomputation", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    const bankStatementId = await makeBankStatement(bankAccountId, 50000);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runAi13();
    let state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    expect(state!.readiness.status).toBe("blocked");

    // Fix the underlying data: post a matching GL entry against the bank account.
    const expenseAccountId = await makeAccount("expense");
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `JE-${Date.now()}`, date: new Date("2026-01-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: bankAccountId, label: "fix", debit: 50000, credit: 0 },
        { accountId: expenseAccountId, label: "fix", debit: 0, credit: 50000 },
      ],
      totals: { amountUntaxed: 50000, amountTax: 0, amountTotal: 50000 },
    });

    await runAi13();
    state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    expect(state!.readiness.status).not.toBe("blocked");
    void bankStatementId;
  });

  it("re-running with unchanged data does not clear the blocker", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    await makeBankStatement(bankAccountId, 50000);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runAi13();
    await runAi13();
    const state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    expect(state!.readiness.status).toBe("blocked");
  });

  it("PeriodClosing.status = reconciled while AI-22 reports unreconciled → CRITICAL contradiction, PeriodClosing itself untouched", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    await makeBankStatement(bankAccountId, 50000);
    const userId = await makeUser();
    await PeriodClosing.create({ tenantId: TENANT, name: "2026-01", fiscalYear: 2026, month: 1, status: "reconciled", createdBy: userId });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi13();

    const finding = envelope.findings.find((f) => f.title.includes("contradicted"));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("critical");
    const periodClosing = await PeriodClosing.findOne({ tenantId: TENANT }).lean();
    expect(periodClosing!.status).toBe("reconciled"); // untouched
  });

  it("no materiality policy configured → indeterminate, never ready", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    // No AiMaterialityPolicy at all, and no data producing a hard blocker either —
    // any blocker anywhere forces unclassified → indeterminate is only guaranteed with at
    // least one imperfect domain. Seed a draft journal entry (transactions domain).
    const expenseAccountId = await makeAccount("expense");
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `JE-${Date.now()}`, date: new Date("2026-01-10"), journalType: "general" },
      status: "draft",
      voucherStatus: "draft",
      lineIds: [{ accountId: expenseAccountId, label: "x", debit: 100, credit: 0 }],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    });

    await runAi13();
    const state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    expect(state!.readiness.status).toBe("indeterminate");
    expect(state!.readiness.status).not.toBe("ready");
  });

  it("not_applicable is distinct from ready — intercompany (no consolidation model exists) is neither", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    await runAi13();
    const state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    const intercompany = state!.domains.find((d) => d.domain === "intercompany");
    expect(intercompany!.status).toBe("not_applicable");
    expect(intercompany!.status).not.toBe("ready");
  });

  it("evidence domain is wired to AI-24 (docs/ai/BRIEF-05-BATCH-D.md Part 0.4) — not_checked only for tax; and tax is wired to AI-22 now too (docs/ai/BRIEF-06-BATCH-E.md A.1) — permanent not_checked domains are ZERO", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-13", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    await runAi13();
    const state = await AiCloseState.findOne({ tenantId: TENANT, period: "2026-01" }).lean();
    const evidence = state!.domains.find((d) => d.domain === "evidence");
    expect(evidence!.status).not.toBe("not_checked");
    const tax = state!.domains.find((d) => d.domain === "tax");
    expect(tax!.status).not.toBe("not_checked"); // no TaxRate.accountId configured in this fixture -> not_applicable, never not_checked

    const notCheckedDomains = state!.domains.filter((d) => d.status === "not_checked");
    expect(notCheckedDomains).toEqual([]);
  });
});

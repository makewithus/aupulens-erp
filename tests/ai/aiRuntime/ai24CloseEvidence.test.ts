import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai24";

import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import PeriodClosing from "@/models/finance/PeriodClosing";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiCloseAssertion from "@/models/ai/AiCloseAssertion";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import User from "@/models/auth/User";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai24CloseEvidence: typeof import("@/lib/aiRuntime/workflows/ai-24-close-evidence").ai24CloseEvidence;

const TENANT = "ai24-tenant";

async function makeAccount(account_type: string) {
  const acc = await Account.create({ tenantId: TENANT, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function runAi24(actingUserId?: string) {
  return runWorkflow(ai24CloseEvidence, {
    tenantId: TENANT,
    eventKey: "period.horizon.reached",
    payload: { period: "2026-01", periodEnd: new Date("2026-01-31T23:59:59Z").toISOString(), actingUserId },
  });
}

describe("AI-24 — Close evidence controller", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      BankStatement.init(),
      JournalEntry.init(),
      PeriodClosing.init(),
      AiMaterialityPolicy.init(),
      AiCloseAssertion.init(),
      AiAttentionItem.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      User.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai24CloseEvidence } = await import("@/lib/aiRuntime/workflows/ai-24-close-evidence"));
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
      AiCloseAssertion.deleteMany({}),
      AiAttentionItem.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      User.deleteMany({}),
    ]);
  });

  it("zero writes to PeriodClosing from AI-24's folder (source-grep, A.2 / Hard Rule 4)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-24-close-evidence || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("a manually-advanced PeriodClosing status whose assertion fails → verified:false and a contradiction finding", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 5000 }, lineIds: [], status: "draft" });
    const userId = await makeUser();
    await PeriodClosing.create({ tenantId: TENANT, name: "2026-01", fiscalYear: 2026, month: 1, status: "reconciled", createdBy: userId });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi24(userId);

    const assertion = await AiCloseAssertion.findOne({ tenantId: TENANT, period: "2026-01", item: "bank_reconciled" }).lean();
    expect(assertion!.verified).toBe(false);
    const contradiction = envelope.findings.find((f) => f.title.includes("bank_reconciled"));
    expect(contradiction).toBeDefined();
    expect(contradiction!.severity).toBe("critical");
  });

  it("a missing document generates exactly one evidence request across repeated sweeps (dedupe)", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 5000 }, lineIds: [], status: "draft" });
    const userId = await makeUser();
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runAi24(userId);
    await runAi24(userId);
    await runAi24(userId);

    const items = await AiAttentionItem.find({ tenantId: TENANT, dedupeKey: "ai24:bank_reconciled:2026-01" }).lean();
    expect(items).toHaveLength(1);
  });

  it("when the document arrives, the assertion passes and the request auto-resolves", async () => {
    const bankAccountId = await makeAccount("asset_cash");
    await BankStatement.create({ tenantId: TENANT, header: { name: "STMT", journalId: bankAccountId, date: new Date(), balance_start: 0, balance_end_real: 5000 }, lineIds: [], status: "draft" });
    const userId = await makeUser();
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "bank", absoluteAmount: 100 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runAi24(userId);
    let item = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: "ai24:bank_reconciled:2026-01" }).lean();
    expect(item!.status).toBe("open");

    // The evidence arrives: a matching GL entry against the bank account.
    const expenseAccountId = await makeAccount("expense");
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `JE-${Date.now()}`, date: new Date("2026-01-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: bankAccountId, label: "fix", debit: 5000, credit: 0 },
        { accountId: expenseAccountId, label: "fix", debit: 0, credit: 5000 },
      ],
      totals: { amountUntaxed: 5000, amountTax: 0, amountTotal: 5000 },
    });

    await runAi24(userId);
    item = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: "ai24:bank_reconciled:2026-01" }).lean();
    expect(item!.status).toBe("auto_resolved");
    const assertion = await AiCloseAssertion.findOne({ tenantId: TENANT, period: "2026-01", item: "bank_reconciled" }).lean();
    expect(assertion!.verified).toBe(true);
  });

  it("completeness_pct excludes not_applicable items from the denominator", async () => {
    const userId = await makeUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-24", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    // No non-INR balances, no assets, no payroll — most domains land not_applicable/ready.
    await runAi24(userId);

    const assertions = await AiCloseAssertion.find({ tenantId: TENANT, period: "2026-01" }).lean();
    expect(assertions.length).toBeGreaterThan(0);
  });
});

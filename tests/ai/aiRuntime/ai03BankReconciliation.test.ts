import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai03";

import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import TransactionLock from "@/models/finance/TransactionLock";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiToolCall from "@/models/ai/AiToolCall";
import AiAttentionItem from "@/models/ai/AiAttentionItem";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai03BankReconciliation: typeof import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation").ai03BankReconciliation;

const TENANT = "ai03-tenant";
const TENANT_B = "ai03-tenant-b";

async function makeBankAccount() {
  const acc = await Account.create({ tenantId: TENANT, name: "Bank Current Account", code: `BANK-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_cash", isActive: true });
  return String(acc._id);
}

let contraAccountId: string;

async function makePostedJournalEntry(accountId: string, amount: number, date: Date, label = "Payment") {
  const entry = await JournalEntry.create({
    tenantId: TENANT,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date, journalType: "bank" },
    voucherStatus: "posted",
    status: "posted",
    lineIds: [
      { accountId, label, debit: amount, credit: 0, reconciled: false },
      // Contra leg on a DIFFERENT account — a real journal entry never has both legs on
      // the same account. Using the same account here would make the matcher find two
      // candidate lines within one entry (both matching the target amount) and correctly
      // classify it as "fuzzy" rather than "exact" — that's real AI-03 behaviour, not a bug;
      // the fixture must look like a real payment entry to exercise the exact-match path.
      { accountId: contraAccountId, label: "Contra", debit: 0, credit: amount, reconciled: false },
    ],
  });
  return String(entry._id);
}

async function makeBankStatement(accountId: string, lines: { date: Date; payment_ref: string; amount: number; partnerId?: mongoose.Types.ObjectId }[], tenantId = TENANT) {
  const stmt = await BankStatement.create({
    tenantId,
    header: { name: `STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, journalId: accountId, date: new Date(), balance_start: 0, balance_end_real: lines.reduce((s, l) => s + l.amount, 0) },
    lineIds: lines.map((l) => ({ ...l, isReconciled: false })),
    status: "draft",
  });
  return String(stmt._id);
}

async function makeFinanceUser(tenantId = TENANT) {
  const u = await User.create({
    tenantId,
    name: "Finance User",
    email: `finance-${Date.now()}-${Math.random()}@example.com`,
    phone: "9999999999",
    password: "hashed",
    role: "finance",
    status: "active",
  });
  return String(u._id);
}

describe("AI-03 — Bank reconciliation", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      BankStatement.init(),
      JournalEntry.init(),
      TransactionLock.init(),
      User.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiWorkflowPolicy.init(),
      AiToolCall.init(),
      AiAttentionItem.init(),
    ]);

    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai03BankReconciliation } = await import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation"));
    bootstrapAiRuntime();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-03", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const contra = await Account.create({ tenantId: TENANT, name: "Accounts Receivable", code: "AR-CONTRA", account_type: "asset_receivable", isActive: true });
    contraAccountId = String(contra._id);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({ _id: { $ne: new mongoose.Types.ObjectId(contraAccountId) } }),
      BankStatement.deleteMany({}),
      JournalEntry.deleteMany({}),
      TransactionLock.deleteMany({}),
      User.deleteMany({ tenantId: { $in: [TENANT, TENANT_B] } }),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiAttentionItem.deleteMany({}),
    ]);
  });

  it("one-to-one exact match → auto-reconciled (EXECUTE) with a real acting user", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    const journalEntryId = await makePostedJournalEntry(accountId, 5000, date);
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Payment ref A", amount: 5000 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    expect(envelope.status).toBe("completed");
    expect(envelope.metrics.autoActioned).toBe(1);

    const statement = await BankStatement.findById(bankStatementId).lean();
    expect(statement!.lineIds[0].isReconciled).toBe(true);
    const entry = await JournalEntry.findById(journalEntryId).lean();
    expect(entry!.lineIds.some((l: { reconciled?: boolean }) => l.reconciled)).toBe(true);
  });

  it("without an acting user, exact matches are found but nothing is auto-reconciled", async () => {
    const accountId = await makeBankAccount();
    const date = new Date();
    await makePostedJournalEntry(accountId, 3000, date);
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Payment ref B", amount: 3000 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId },
    });

    expect(envelope.autonomyApplied).toBe("recommend");
    const statement = await BankStatement.findById(bankStatementId).lean();
    expect(statement!.lineIds[0].isReconciled).toBe(false);
  });

  it("false positive: right amount but a different tenant's journal entry must NOT match", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    // A journal entry for a DIFFERENT tenant with the same account id string coincidentally
    // reused would be a modelling error; instead simulate via a same-tenant account but ensure
    // tenant scoping is what prevents cross-tenant matching by checking the query is tenant-scoped.
    await JournalEntry.create({
      tenantId: TENANT_B,
      header: { name: `JE-OTHER-${Date.now()}`, date, journalType: "bank" },
      voucherStatus: "posted",
      status: "posted",
      lineIds: [{ accountId, label: "Other tenant", debit: 7000, credit: 0, reconciled: false }],
    });
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Payment ref C", amount: 7000 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    expect(envelope.metrics.autoActioned).toBe(0);
    const statement = await BankStatement.findById(bankStatementId).lean();
    expect(statement!.lineIds[0].isReconciled).toBe(false);
  });

  it("multiple candidates (fuzzy) → proposed only, never auto-applied this batch", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    await makePostedJournalEntry(accountId, 2000, date, "Candidate 1");
    await makePostedJournalEntry(accountId, 2000, date, "Candidate 2");
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Ambiguous", amount: 2000 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    expect(envelope.metrics.autoActioned).toBe(0);
    const finding = envelope.findings.find((f) => f.title.includes("Multiple possible"));
    expect(finding).toBeDefined();
    const statement = await BankStatement.findById(bankStatementId).lean();
    expect(statement!.lineIds[0].isReconciled).toBe(false);
  });

  it("internal transfer between own bank accounts is classified, not treated as two unrelated payments", async () => {
    const accountA = await makeBankAccount();
    const accountB = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    await makeBankStatement(accountB, [{ date, payment_ref: "Transfer out", amount: -4000 }]);
    const bankStatementId = await makeBankStatement(accountA, [{ date, payment_ref: "Transfer in", amount: 4000 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    const finding = envelope.findings.find((f) => f.title.includes("Internal transfer"));
    expect(finding).toBeDefined();
  });

  it("a bank line with a Customer partnerId and no Finance-side match is classified unknown_ar_side, not guessed", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    const bankStatementId = await makeBankStatement(accountId, [
      { date, payment_ref: "Customer receipt", amount: 1500, partnerId: new mongoose.Types.ObjectId() },
    ]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    const finding = envelope.findings.find((f) => f.title.includes("Sales-side"));
    expect(finding).toBeDefined();
  });

  it("bank fee is classified and drafted as a journal, never posted", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    await Account.create({ tenantId: TENANT, name: "Bank Charges", code: `EXP-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true });
    const date = new Date();
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Bank service fee", amount: -50 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    const finding = envelope.findings.find((f) => f.title.includes("Bank fee"));
    expect(finding).toBeDefined();
    const draftedEntry = await JournalEntry.findOne({ tenantId: TENANT, voucherStatus: "draft" }).lean();
    expect(draftedEntry).not.toBeNull();
  });

  it("a locked period refuses reconcile_transaction via the real TransactionLock", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    await makePostedJournalEntry(accountId, 6000, date);
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Locked period payment", amount: 6000 }]);
    await TransactionLock.create({ tenantId: TENANT, module: "banking", lockedUpToDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), isLocked: true, lockedBy: new mongoose.Types.ObjectId() });

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    expect(envelope.metrics.autoActioned).toBe(0);
    const statement = await BankStatement.findById(bankStatementId).lean();
    expect(statement!.lineIds[0].isReconciled).toBe(false);
  });

  it("re-running the sweep never double-reconciles an already-matched line", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    await makePostedJournalEntry(accountId, 8000, date);
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Idempotency check", amount: 8000 }]);

    await runWorkflow(ai03BankReconciliation, { tenantId: TENANT, eventKey: "bank.transaction.imported", payload: { bankStatementId, actingUserId: userId } });
    // Second pass — via the hourly sweep path, simulating a re-run over the same (now-reconciled) statement.
    const envelope2 = await runWorkflow(ai03BankReconciliation, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    expect(envelope2.metrics.autoActioned).toBe(0); // nothing left unreconciled to act on
    const statement = await BankStatement.findById(bankStatementId).lean();
    expect(statement!.lineIds.filter((l: { isReconciled: boolean }) => l.isReconciled)).toHaveLength(1);
  });
});

import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai03_edge";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiAttentionItem from "@/models/ai/AiAttentionItem";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai03BankReconciliation: typeof import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation").ai03BankReconciliation;
let bankImportRoutePOST: typeof import("@/app/api/finance/bank/import/route").POST;

const TENANT = "ai03-edge-tenant";
let contraAccountId: string;

async function makeBankAccount(tenantId = TENANT) {
  const acc = await Account.create({ tenantId, name: "Bank Current Account", code: `BANK-${Math.random().toString(36).slice(2, 8)}`, account_type: "asset_cash", isActive: true });
  return String(acc._id);
}

async function makePostedJournalEntry(tenantId: string, accountId: string, amount: number, date: Date, label = "Payment") {
  const entry = await JournalEntry.create({
    tenantId,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date, journalType: "bank" },
    voucherStatus: "posted",
    status: "posted",
    lineIds: [
      { accountId, label, debit: amount, credit: 0, reconciled: false },
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

describe("AI-03 — trigger proof and edge-case matrix (Chunk 9 verification)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Account.init(), BankStatement.init(), JournalEntry.init(), Customer.init(), User.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiAttentionItem.init()]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai03BankReconciliation } = await import("@/lib/aiRuntime/workflows/ai-03-bank-reconciliation"));
    ({ POST: bankImportRoutePOST } = await import("@/app/api/finance/bank/import/route"));
    bootstrapAiRuntime();
    const contra = await Account.create({ tenantId: TENANT, name: "Accounts Receivable", code: "AR-CONTRA-EDGE", account_type: "asset_receivable", isActive: true });
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
      User.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      AiAttentionItem.deleteMany({}),
    ]);
    vi.clearAllMocks();
  });

  // ── 1. Trigger proof — the REAL route, not runWorkflow() called directly ────────────────────
  it("TRIGGER PROOF: POST /api/finance/bank/import (the real statement-import route) fires AI-03 as a side effect and auto-reconciles an exact match — no code here calls runWorkflow() or the workflow module directly", async () => {
    const accountId = await makeBankAccount();
    // A real, persisted User is required — the real check_permission tool (rbacRouter.ts) looks
    // this id up via User.findOne(), so a synthetic non-ObjectId session id would crash the run.
    const userId = await makeFinanceUser();
    mockAuth.mockResolvedValue({ user: { id: userId, tenantId: TENANT } });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-03", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const date = new Date();
    const journalEntryId = await makePostedJournalEntry(TENANT, accountId, 5000, date);

    const req = {
      json: () =>
        Promise.resolve({
          header: { name: "STMT-TRIGGER", journalId: accountId, date, balance_start: 0, balance_end_real: 5000 },
          lineIds: [{ date, payment_ref: "Trigger payment", amount: 5000, isReconciled: false }],
          status: "draft",
        }),
    } as any;

    const res = await bankImportRoutePOST(req);
    const body = await res.json();
    expect(body._id).toBeTruthy();

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-03" }).lean();
    expect(run).not.toBeNull();
    expect(run!.status).toBe("completed");

    const statement = await BankStatement.findById(body._id).lean();
    expect(statement!.lineIds[0].isReconciled).toBe(true);
    const entry = await JournalEntry.findById(journalEntryId).lean();
    expect(entry!.lineIds.some((l: { reconciled?: boolean }) => l.reconciled)).toBe(true);
  });

  // ── 4. Edge-case matrix ──────────────────────────────────────────────────────────────────────

  it("C.4 cross-tenant hostile input: a bankStatementId belonging to tenant B, referenced from a tenant-A event, is never read or actioned (regression for the unscoped-findById cross-tenant bug)", async () => {
    const TENANT_B = "ai03-edge-tenant-b";
    const accountIdB = await makeBankAccount(TENANT_B);
    const bankStatementIdB = await makeBankStatement(accountIdB, [{ date: new Date(), payment_ref: "Tenant B private line", amount: 9999 }], TENANT_B);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-03", killSwitchEnabled: true, maxAutonomyLevel: "execute" });

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId: bankStatementIdB, actingUserId: "hostile-user" },
    });

    // No exception thrown at the workflow level (extract() `continue`s past a not-found
    // statement) — but the observable proof is what matters: nothing from tenant B is read,
    // matched, or reconciled under tenant A's run.
    expect(envelope.metrics.scanned).toBe(0);
    expect(envelope.metrics.autoActioned).toBe(0);
    const statementB = await BankStatement.findById(bankStatementIdB).lean();
    expect(statementB!.lineIds[0].isReconciled).toBe(false);
  });

  it("C.1 large volume: 250 irrelevant OLD posted journal entries on the bank account do not crowd out a genuine same-day exact match (regression for the unbounded/unsorted findExactMatches bug)", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-03", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const today = new Date();
    const longAgo = new Date(today.getTime() - 400 * 24 * 60 * 60 * 1000); // ~13 months ago — well outside the 5-day match window

    // Bulk-insert 250 old, irrelevant entries FIRST — before the .limit(200) fix, natural
    // (insertion) order + no date filter meant these alone could fill the query's cap and
    // silently exclude the real match below.
    const oldRows = Array.from({ length: 250 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `OLD-JE-${i}`, date: longAgo, journalType: "bank" },
      voucherStatus: "posted",
      status: "posted",
      lineIds: [
        { accountId: new mongoose.Types.ObjectId(accountId), label: "Old noise", debit: 5000, credit: 0, reconciled: false },
        { accountId: new mongoose.Types.ObjectId(contraAccountId), label: "Contra", debit: 0, credit: 5000, reconciled: false },
      ],
    }));
    await JournalEntry.insertMany(oldRows);

    const journalEntryId = await makePostedJournalEntry(TENANT, accountId, 5000, today, "The real match");
    const bankStatementId = await makeBankStatement(accountId, [{ date: today, payment_ref: "Large volume payment", amount: 5000 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    expect(envelope.status).toBe("completed");
    expect(envelope.metrics.autoActioned).toBe(1);
    const entry = await JournalEntry.findById(journalEntryId).lean();
    expect(entry!.lineIds.some((l: { reconciled?: boolean }) => l.reconciled)).toBe(true);
  });

  it("C.6 adversarial — confidently wrong answer: a Customer-linked receipt that coincidentally matches an unrelated internal-transfer-shaped line is escalated as unknown_ar_side, never mis-explained as an internal transfer (regression for the ordering bug)", async () => {
    const accountA = await makeBankAccount();
    const accountB = await makeBankAccount();
    const userId = await makeFinanceUser();
    const date = new Date();
    const customerId = (await Customer.create({ tenantId: TENANT, header: { name: "Real Customer" }, createdBy: new mongoose.Types.ObjectId() }))._id;

    // A coincidental opposite-signed, same-magnitude, same-window line on a different bank
    // account — shaped exactly like a real internal transfer, but unrelated.
    await makeBankStatement(accountB, [{ date, payment_ref: "Unrelated outgoing", amount: -6000 }]);
    const bankStatementId = await makeBankStatement(accountA, [{ date, payment_ref: "Customer payment received", amount: 6000, partnerId: customerId }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    const arSideFinding = envelope.findings.find((f) => f.title.includes("Sales-side"));
    const transferFinding = envelope.findings.find((f) => f.title.includes("Internal transfer"));
    expect(arSideFinding).toBeDefined();
    expect(transferFinding).toBeUndefined();
  });

  it("C.3 concurrent duplicate event: the SAME bank.transaction.imported event fired simultaneously reconciles exactly once", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-03", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const date = new Date();
    const journalEntryId = await makePostedJournalEntry(TENANT, accountId, 8800, date);
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Concurrent payment", amount: 8800 }]);
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "bank.transaction.imported", payload: { bankStatementId, actingUserId: userId } });
    const triggerEvent = { id: String(event._id), tenantId: TENANT, eventKey: "bank.transaction.imported", payload: { bankStatementId, actingUserId: userId } };

    await Promise.allSettled([
      runWorkflow(ai03BankReconciliation, triggerEvent),
      runWorkflow(ai03BankReconciliation, triggerEvent),
    ]);

    const runCount = await AiWorkflowRun.countDocuments({ workflowId: "AI-03", triggerEventId: event._id });
    expect(runCount).toBe(1);
    const entry = await JournalEntry.findById(journalEntryId).lean();
    const reconciledLines = entry!.lineIds.filter((l: { reconciled?: boolean }) => l.reconciled);
    expect(reconciledLines).toHaveLength(1); // not double-reconciled (would show 2 if the contra leg also got flipped twice, or if two separate reconcile calls both mutated it)
  });

  it("C.1 precision: an amount with sub-paisa floating point drift (0.1 + 0.2 shape) still matches within AMOUNT_TOLERANCE", async () => {
    const accountId = await makeBankAccount();
    const userId = await makeFinanceUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-03", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const date = new Date();
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE754 — the journal entry is seeded with that exact
    // float, the bank line with the clean 300.3, to exercise the tolerance comparison for real.
    const drifted = 300 + (0.1 + 0.2);
    const journalEntryId = await makePostedJournalEntry(TENANT, accountId, drifted, date);
    const bankStatementId = await makeBankStatement(accountId, [{ date, payment_ref: "Precision payment", amount: 300.3 }]);

    const envelope = await runWorkflow(ai03BankReconciliation, {
      tenantId: TENANT,
      eventKey: "bank.transaction.imported",
      payload: { bankStatementId, actingUserId: userId },
    });

    expect(envelope.metrics.autoActioned).toBe(1);
    const entry = await JournalEntry.findById(journalEntryId).lean();
    expect(entry!.lineIds.some((l: { reconciled?: boolean }) => l.reconciled)).toBe(true);
  });
});

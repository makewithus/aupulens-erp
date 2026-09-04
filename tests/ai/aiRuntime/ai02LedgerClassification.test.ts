import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai02";

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: vi.fn(async () => ({ tier: "starter", aiSettings: {} })),
  callClaudeForTenant: vi.fn(async () => ({ gated: false, text: JSON.stringify({ accountId: "unused", confidence: 0.5, alternatives: [] }) })),
}));

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import BankingRule from "@/models/finance/BankingRule";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai02LedgerClassification: typeof import("@/lib/aiRuntime/workflows/ai-02-ledger-classification").ai02LedgerClassification;
let callClaudeForTenantMock: ReturnType<typeof vi.fn>;

const TENANT = "ai02-tenant";

async function makeAccount(overrides: Partial<{ name: string; code: string; account_type: string; internal_group: string; isActive: boolean; isLocked: boolean }> = {}) {
  const acc = await Account.create({
    tenantId: TENANT,
    name: overrides.name ?? "Office Rent",
    code: overrides.code ?? `EXP-${Math.random().toString(36).slice(2, 8)}`,
    account_type: overrides.account_type ?? "expense",
    internal_group: overrides.internal_group ?? "expense",
    isActive: overrides.isActive ?? true,
    isLocked: overrides.isLocked ?? false,
    status: "active",
  });
  return String(acc._id);
}

async function makeVendorCustomer(name: string) {
  const c = await Customer.create({
    tenantId: TENANT,
    header: { name, is_company: true },
    createdBy: new mongoose.Types.ObjectId(),
  });
  return c._id as mongoose.Types.ObjectId;
}

async function makeDraftBill(partnerId: mongoose.Types.ObjectId, opts: { description?: string; amount?: number } = {}) {
  const inv = await Invoice.create({
    tenantId: TENANT,
    name: `DRAFT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    moveType: "in_invoice",
    state: "draft",
    invoiceDate: new Date(),
    dueDate: new Date(),
    invoiceLines: [{ name: opts.description ?? "Monthly rent", priceSubtotal: opts.amount ?? 1000, quantity: 1, priceUnit: opts.amount ?? 1000 }],
    amountTotal: opts.amount ?? 1000,
  });
  return String(inv._id);
}

async function makeFinanceUser() {
  const u = await User.create({
    tenantId: TENANT,
    name: "Finance User",
    email: `finance-${Date.now()}-${Math.random()}@example.com`,
    phone: "9999999999",
    password: "hashed",
    role: "finance",
    status: "active",
  });
  return String(u._id);
}

describe("AI-02 — Ledger classification", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Account.init(), Invoice.init(), Customer.init(), BankingRule.init(), User.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init()]);

    await AiWorkflowPolicy.init();
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai02LedgerClassification } = await import("@/lib/aiRuntime/workflows/ai-02-ledger-classification"));
    const tenantAi = await import("@/lib/ai/tenantAi");
    callClaudeForTenantMock = tenantAi.callClaudeForTenant as unknown as ReturnType<typeof vi.fn>;
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}),
      Invoice.deleteMany({}),
      Customer.deleteMany({}),
      BankingRule.deleteMany({}),
      User.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
    callClaudeForTenantMock.mockClear();
  });

  it("a matching BankingRule wins over the model — and the model is never called", async () => {
    const accountId = await makeAccount({ name: "Rent Expense" });
    const partnerId = await makeVendorCustomer("Acme Landlords Pvt Ltd");
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Rent Rule",
      applyTo: "withdrawals",
      criteriaMatch: "any",
      criteria: [{ field: "Vendor", operator: "Contains", value: "Landlords" }],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invoiceId = await makeDraftBill(partnerId);

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId },
    });

    expect(envelope.findings[0].detail).toContain(accountId);
    expect(callClaudeForTenantMock).not.toHaveBeenCalled();

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace!.reasonChain.some((r) => r.includes("BankingRule"))).toBe(true);
  });

  it("criteria any/all semantics: an 'all' rule does not match when only one criterion is satisfied", async () => {
    const accountId = await makeAccount();
    const partnerId = await makeVendorCustomer("Contains Rent In Name");
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Strict Rule",
      applyTo: "withdrawals",
      criteriaMatch: "all",
      criteria: [
        { field: "Vendor", operator: "Contains", value: "Rent" },
        { field: "Amount", operator: "Greater Than", value: "999999" }, // never true for our fixture
      ],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invoiceId = await makeDraftBill(partnerId, { amount: 1000 });

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId },
    });

    // Should NOT be the strict rule's finding — falls through to model/none path instead.
    expect(envelope.findings[0]?.detail ?? "").not.toContain("Strict Rule");
  });

  it("a control account is never auto-selected, even at high model confidence", async () => {
    await makeAccount({ name: "Accounts Payable Control", account_type: "liability_payable" });
    const realAccountId = await makeAccount({ name: "Office Supplies" });
    callClaudeForTenantMock.mockResolvedValueOnce({
      gated: false,
      text: JSON.stringify({ accountId: "not-a-real-id", confidence: 1 }),
    });
    const partnerId = await makeVendorCustomer("Some New Vendor");
    const invoiceId = await makeDraftBill(partnerId, { description: "Random purchase" });

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId },
    });

    // The model's chosen id isn't in the candidate set (control account excluded, and the
    // fake id doesn't exist) — must be rejected, never silently accepted.
    expect(envelope.status).not.toBe("completed");
    void realAccountId;
  });

  it("an inactive account is never proposed as a candidate", async () => {
    const inactiveId = await makeAccount({ name: "Old Closed Account", isActive: false });
    callClaudeForTenantMock.mockResolvedValueOnce({
      gated: false,
      text: JSON.stringify({ accountId: inactiveId, confidence: 0.99 }),
    });
    const partnerId = await makeVendorCustomer("Fresh Vendor");
    const invoiceId = await makeDraftBill(partnerId);

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId },
    });

    const finding = envelope.findings.find((f) => f.detail.includes(inactiveId));
    expect(finding).toBeUndefined();
  });

  it("false positive: an ambiguous new vendor with no history and a gated model proposes nothing and sets nothing (raised for review, not silently ignored)", async () => {
    await makeAccount();
    callClaudeForTenantMock.mockResolvedValueOnce({ gated: true, code: "AI_DISABLED", error: "disabled" });
    const partnerId = await makeVendorCustomer("Brand New Vendor Co");
    const invoiceId = await makeDraftBill(partnerId);

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId },
    });

    // No confident proposal exists — the gate correctly cannot reach EXECUTE (confidence 0),
    // so it escalates for human review rather than silently no-op'ing an unclassified line.
    expect(envelope.status).toBe("escalated");
    expect(envelope.findings).toHaveLength(0);
    const invoice = await Invoice.findById(invoiceId).lean();
    expect((invoice as { invoiceLines?: { accountId?: unknown }[] })!.invoiceLines?.[0]?.accountId).toBeUndefined();
  });

  it("EXECUTE path: with a real acting user, a validated (killSwitchEnabled) policy, and a matching BankingRule, the draft account is actually set", async () => {
    const accountId = await makeAccount({ name: "Rent Expense" });
    const userId = await makeFinanceUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-02", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const partnerId = await makeVendorCustomer("Landlord Group");
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Rent Rule",
      applyTo: "withdrawals",
      criteriaMatch: "any",
      criteria: [{ field: "Vendor", operator: "Contains", value: "Landlord" }],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invoiceId = await makeDraftBill(partnerId);

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId, actingUserId: userId },
    });

    expect(envelope.status).toBe("completed");
    const invoice = await Invoice.findById(invoiceId).lean();
    expect(String((invoice as { invoiceLines?: { accountId?: unknown }[] })!.invoiceLines?.[0]?.accountId)).toBe(accountId);
  });

  it("without an acting user, autonomy drops to RECOMMEND and no account is set even with a matching rule", async () => {
    const accountId = await makeAccount({ name: "Rent Expense" });
    const partnerId = await makeVendorCustomer("Landlord Group Two");
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Rent Rule 2",
      applyTo: "withdrawals",
      criteriaMatch: "any",
      criteria: [{ field: "Vendor", operator: "Contains", value: "Landlord" }],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invoiceId = await makeDraftBill(partnerId);

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId },
    });

    expect(envelope.autonomyApplied).toBe("recommend");
    const invoice = await Invoice.findById(invoiceId).lean();
    expect((invoice as { invoiceLines?: { accountId?: unknown }[] })!.invoiceLines?.[0]?.accountId).toBeUndefined();
  });

  it("idempotency: the same trigger event twice produces exactly one run and sets the account once", async () => {
    const accountId = await makeAccount({ name: "Rent Expense" });
    const userId = await makeFinanceUser();
    const partnerId = await makeVendorCustomer("Landlord Idem");
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Idem Rule",
      applyTo: "withdrawals",
      criteriaMatch: "any",
      criteria: [{ field: "Vendor", operator: "Contains", value: "Landlord" }],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invoiceId = await makeDraftBill(partnerId);
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });
    const triggerEvent = { id: String(event._id), tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } };

    const first = await runWorkflow(ai02LedgerClassification, triggerEvent);
    const second = await runWorkflow(ai02LedgerClassification, triggerEvent);

    expect(second.runId).toBe(first.runId);
    const runCount = await AiWorkflowRun.countDocuments({ workflowId: "AI-02" });
    expect(runCount).toBe(1);
  });
});

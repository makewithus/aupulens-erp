import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai02_edge";

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: vi.fn(async () => ({ tier: "starter", aiSettings: {} })),
  callClaudeForTenant: vi.fn(async () => ({ gated: true, code: "NO_LIVE_MODEL", error: "no live model in this environment" })),
}));

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Expense from "@/models/finance/Expense";
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
let expensesRoutePOST: typeof import("@/app/api/finance/expenses/route").POST;

const TENANT = "ai02-edge-tenant";

async function makeAccount(tenantId: string, overrides: Partial<{ name: string; account_type: string }> = {}) {
  const acc = await Account.create({
    tenantId,
    name: overrides.name ?? "Office Rent",
    code: `EXP-${Math.random().toString(36).slice(2, 8)}`,
    account_type: overrides.account_type ?? "expense",
    internal_group: "expense",
    isActive: true,
    isLocked: false,
    status: "active",
  });
  return String(acc._id);
}

async function makeVendorCustomer(name: string, tenantId = TENANT) {
  const c = await Customer.create({ tenantId, header: { name, is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeDraftBill(tenantId: string, partnerId: mongoose.Types.ObjectId, opts: { description?: string; amount?: number } = {}) {
  const inv = await Invoice.create({
    tenantId,
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

describe("AI-02 — trigger proof and edge-case matrix (Chunk 9 verification)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Account.init(), Invoice.init(), Expense.init(), Customer.init(), BankingRule.init(), User.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init()]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai02LedgerClassification } = await import("@/lib/aiRuntime/workflows/ai-02-ledger-classification"));
    ({ POST: expensesRoutePOST } = await import("@/app/api/finance/expenses/route"));
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
      Expense.deleteMany({}),
      Customer.deleteMany({}),
      BankingRule.deleteMany({}),
      User.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
    vi.clearAllMocks();
  });

  // ── 1. Trigger proof — the REAL route, not runWorkflow() called directly ────────────────────
  it("TRIGGER PROOF: POST /api/finance/expenses (the real expense-submission route) fires AI-02 as a side effect and sets the classified account — no code here calls runWorkflow() or the workflow module directly", async () => {
    const accountId = await makeAccount(TENANT, { name: "Travel Expense" });
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Travel Rule",
      applyTo: "withdrawals",
      criteriaMatch: "any",
      criteria: [{ field: "Description", operator: "Contains", value: "flight" }],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-02", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    // A real, persisted User is required — the real check_permission tool (rbacRouter.ts) looks
    // this id up via User.findOne(), so a synthetic non-ObjectId session id would crash the run.
    const employeeId = await makeFinanceUser();
    mockAuth.mockResolvedValue({ user: { id: employeeId, tenantId: TENANT } });
    const placeholderAccount = await makeAccount(TENANT, { name: "Suspense" });
    const req = {
      json: () =>
        Promise.resolve({
          description: "Domestic flight booking",
          category: "travel",
          total: 4500,
          employeeId,
          accountId: placeholderAccount,
        }),
    } as any;

    const res = await expensesRoutePOST(req);
    const body = await res.json();
    expect(body.success).toBe(true);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-02" }).lean();
    expect(run).not.toBeNull();
    expect(run!.status).toBe("completed");

    const expense = await Expense.findById(body.expense._id).lean();
    expect(String((expense as { accountId?: unknown })!.accountId)).toBe(accountId);
  });

  // ── 4. Edge-case matrix ──────────────────────────────────────────────────────────────────────

  it("C.4 cross-tenant hostile input: an invoiceId belonging to tenant B, referenced from a tenant-A event, is never read or actioned (regression for the unscoped-findById cross-tenant bug)", async () => {
    const TENANT_B = "ai02-edge-tenant-b";
    const partnerIdB = await makeVendorCustomer("Tenant B Vendor", TENANT_B);
    const invoiceIdB = await makeDraftBill(TENANT_B, partnerIdB, { description: "Tenant B's private bill" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-02", killSwitchEnabled: true, maxAutonomyLevel: "execute" });

    await expect(
      runWorkflow(ai02LedgerClassification, {
        tenantId: TENANT,
        eventKey: "bill.created",
        payload: { invoiceId: invoiceIdB, actingUserId: "hostile-user" },
      }),
    ).rejects.toThrow(/not found/);

    const invoiceB = await Invoice.findById(invoiceIdB).lean();
    expect((invoiceB as { invoiceLines?: { accountId?: unknown }[] })!.invoiceLines?.[0]?.accountId).toBeUndefined();
  });

  it("C.1 large volume: 500 prior invoices for one vendor, correctly tallied by lookupHistory's bounded query — top account still wins, no unbounded scan needed", async () => {
    const accountId = await makeAccount(TENANT, { name: "Golden History Target" });
    const otherAccountId = new mongoose.Types.ObjectId();
    const partnerId = await makeVendorCustomer("High Volume Vendor");

    // Bulk-insert (not one-by-one .create()) to keep the test fast at real scale.
    const rows = Array.from({ length: 500 }, (_, i) => ({
      tenantId: TENANT,
      name: `BULK-${i}-${Math.random().toString(36).slice(2, 6)}`,
      partnerId,
      moveType: "in_invoice",
      state: "posted",
      invoiceDate: new Date(),
      dueDate: new Date(),
      invoiceLines: [{ name: "Prior", priceSubtotal: 1000, quantity: 1, priceUnit: 1000, accountId: i < 480 ? new mongoose.Types.ObjectId(accountId) : otherAccountId }],
      amountTotal: 1000,
    }));
    await Invoice.insertMany(rows);

    const userId = await makeFinanceUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-02", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const invoiceId = await makeDraftBill(TENANT, partnerId, { description: "New order" });

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId, actingUserId: userId },
    });

    expect(envelope.status).toBe("completed");
    const invoice = await Invoice.findById(invoiceId).lean();
    expect(String((invoice as { invoiceLines?: { accountId?: unknown }[] })!.invoiceLines?.[0]?.accountId)).toBe(accountId);
  });

  it("C.1 null/missing fields: an Invoice whose invoiceLines[0] is present but has no name/priceSubtotal (a malformed line, not an empty array) does not throw — degrades to a clean no-classification, never a crash", async () => {
    await makeAccount(TENANT);
    const partnerId = await makeVendorCustomer("Sparse Line Vendor");
    const invoice = await Invoice.create({
      tenantId: TENANT,
      name: `SPARSE-${Date.now()}`,
      partnerId,
      moveType: "in_invoice",
      state: "draft",
      invoiceDate: new Date(),
      dueDate: new Date(),
      invoiceLines: [{}], // present element, every optional field absent
      amountTotal: 500,
    });

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId: String(invoice._id) },
    });

    expect(["escalated", "completed", "no_action"]).toContain(envelope.status);
    const after = await Invoice.findById(invoice._id).lean();
    expect((after as { invoiceLines?: { accountId?: unknown }[] })!.invoiceLines?.[0]?.accountId).toBeUndefined();
  });

  it("C.3 concurrent duplicate event: the SAME bill.created event fired simultaneously sets the account exactly once", async () => {
    const accountId = await makeAccount(TENANT, { name: "Rent Expense" });
    const userId = await makeFinanceUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-02", killSwitchEnabled: true, maxAutonomyLevel: "execute" });
    const partnerId = await makeVendorCustomer("Landlord Concurrent");
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Concurrent Rent Rule",
      applyTo: "withdrawals",
      criteriaMatch: "any",
      criteria: [{ field: "Vendor", operator: "Contains", value: "Landlord" }],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invoiceId = await makeDraftBill(TENANT, partnerId);
    const event = await AiEvent.create({ tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });
    const triggerEvent = { id: String(event._id), tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } };

    await Promise.allSettled([
      runWorkflow(ai02LedgerClassification, triggerEvent),
      runWorkflow(ai02LedgerClassification, triggerEvent),
    ]);

    const runCount = await AiWorkflowRun.countDocuments({ workflowId: "AI-02", triggerEventId: event._id });
    expect(runCount).toBe(1);
    const invoice = await Invoice.findById(invoiceId).lean();
    expect(String((invoice as { invoiceLines?: { accountId?: unknown }[] })!.invoiceLines?.[0]?.accountId)).toBe(accountId);
  });

  it("C.6 adversarial — confidently wrong answer: an 'all'-match rule whose vendor criterion superficially matches must not be applied when a non-vendor criterion fails, even though the vendor name alone looks conclusive", async () => {
    const accountId = await makeAccount(TENANT);
    const partnerId = await makeVendorCustomer("Rent-A-Center Furniture Co"); // contains "Rent" but is NOT a landlord
    await BankingRule.create({
      tenantId: TENANT,
      ruleName: "Real Rent Rule",
      applyTo: "withdrawals",
      criteriaMatch: "all",
      criteria: [
        { field: "Vendor", operator: "Contains", value: "Rent" },
        { field: "Amount", operator: "Greater Than", value: "50000" }, // real rent is always > 50k; this purchase isn't
      ],
      recordAs: "expense",
      accountId,
      createdBy: new mongoose.Types.ObjectId(),
    });
    const invoiceId = await makeDraftBill(TENANT, partnerId, { description: "Furniture purchase", amount: 3000 });

    const envelope = await runWorkflow(ai02LedgerClassification, {
      tenantId: TENANT,
      eventKey: "bill.created",
      payload: { invoiceId },
    });

    // Must NOT confidently classify as "Rent Expense" just because the vendor name contains "Rent".
    expect(envelope.findings[0]?.detail ?? "").not.toContain(accountId);
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai10edge";

const { mockAuth } = vi.hoisted(() => ({ mockAuth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mockAuth }));

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import Asset from "@/models/finance/Asset";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai10FixedAsset: typeof import("@/lib/aiRuntime/workflows/ai-10-fixed-asset").ai10FixedAsset;
let createDraftBill: typeof import("@/lib/docIntel/billCreate").createDraftBill;

const TENANT = "ai10-edge-tenant";
const OTHER_TENANT = "ai10-edge-other-tenant";

async function makeUser(tenantId = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeAccount(account_type: string, tenantId = TENANT) {
  const acc = await Account.create({ tenantId, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeCustomer(tenantId = TENANT) {
  const c = await Customer.create({ tenantId, header: { name: "Acme Vendor", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeBill(description: string, amount: number, accountId?: string, currencyId = "INR", tenantId = TENANT) {
  const partnerId = await makeCustomer(tenantId);
  const inv = await Invoice.create({
    tenantId,
    name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    moveType: "in_invoice",
    state: "draft",
    invoiceDate: new Date("2026-02-01"),
    dueDate: new Date("2026-02-01"),
    invoiceLines: [{ name: description, priceSubtotal: amount, quantity: 1, priceUnit: amount, accountId: accountId ? new mongoose.Types.ObjectId(accountId) : undefined }],
    amountTotal: amount,
    currencyId,
  });
  return String(inv._id);
}

describe("AI-10 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      Invoice.init(),
      Customer.init(),
      User.init(),
      Asset.init(),
      JournalEntry.init(),
      AiSchedule.init(),
      AiMaterialityPolicy.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai10FixedAsset } = await import("@/lib/aiRuntime/workflows/ai-10-fixed-asset"));
    ({ createDraftBill } = await import("@/lib/docIntel/billCreate"));
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
      Asset.deleteMany({}),
      JournalEntry.deleteMany({}),
      AiSchedule.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
    vi.clearAllMocks();
  });

  // ── Section 1: trigger proof — bill.created via the REAL business action ──────────────────
  // createDraftBill() is the actual service function the doc-intelligence confirm route calls
  // when a human confirms an extracted vendor bill — not a synthetic runWorkflow() event. It
  // internally calls safeEmitEvent(..., "bill.created", ...), the real call site.
  it("trigger proof: createDraftBill() (the real vendor-bill-confirm action) fires AI-10's capital-check without calling runWorkflow() directly", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 30000 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });
    const userId = await makeUser();

    const result = await createDraftBill(
      {
        vendorName: "Heavy Machinery Supplier",
        vendorGstin: "",
        billNumber: "INV-001",
        billDate: "2026-02-01",
        dueDate: "2026-02-15",
        currency: "INR",
        poReference: "",
        lineItems: [{ description: "Heavy machinery equipment", quantity: 1, unitPrice: 500000, amount: 500000 }],
        subtotal: 500000,
        taxAmount: 0,
        totalAmount: 500000,
        confidence: 90,
      },
      { tenantId: TENANT, userId },
    );

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-10", entityId: String(result.invoiceId) }).lean();
    expect(run, "createDraftBill's real safeEmitEvent('bill.created', ...) call must have reached AI-10").not.toBeNull();
    expect(run!.findings.some((f) => f.title.includes("Capital-expenditure candidate"))).toBe(true);
  });

  // ── Section 1 (asset.created): trigger proof via the REAL API route, not runWorkflow() ────
  it("trigger proof: the real POST /api/finance/assets route (not runWorkflow()) fires AI-10's schedule-init", async () => {
    const assetAccountId = await makeAccount("asset_fixed");
    const depAccountId = await makeAccount("expense_depreciation");
    mockAuth.mockResolvedValue({ user: { id: "route-user-1", tenantId: TENANT } });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const { POST } = await import("@/app/api/finance/assets/route");
    const body = {
      name: "Route-Created Van",
      purchaseDate: "2026-01-17",
      originalValue: 120000,
      salvageValue: 0,
      method: "linear",
      durationYears: 5,
      accounts: { assetAccountId, depreciationAccountId: depAccountId },
      status: "posted",
    };
    const req = { json: () => Promise.resolve(body) } as any;
    const res = await POST(req);
    expect(res.status ?? 200).toBeLessThan(300);
    const created = await res.json();

    const schedule = await AiSchedule.findOne({ tenantId: TENANT, "sourceRef.id": String(created._id) }).lean();
    expect(schedule, "the real asset-creation route's safeEmitEvent('asset.created', ...) must have reached AI-10").not.toBeNull();
    expect(schedule!.scheduleType).toBe("depreciation");
  });

  // ── C.3 concurrent duplicate event: schedule.due fired twice "simultaneously" ─────────────
  it("concurrent duplicate schedule.due dispatch → exactly one drafted depreciation journal", async () => {
    const assetAccountId = await makeAccount("asset_fixed");
    const depAccountId = await makeAccount("expense_depreciation");
    const userId = await makeUser();
    const asset = await Asset.create({
      tenantId: TENANT,
      name: "Concurrent Printer",
      purchaseDate: new Date("2026-01-01"),
      originalValue: 12000,
      salvageValue: 0,
      method: "linear",
      durationYears: 1,
      accounts: { assetAccountId, depreciationAccountId: depAccountId },
      status: "posted",
    });
    const schedule = await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "depreciation",
      sourceRef: { model: "Asset", id: String(asset._id) },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 12000,
      currency: "INR",
      debitAccountId: depAccountId,
      creditAccountId: assetAccountId,
      basis: "stated",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 12000,
      nextRunDate: new Date("2026-01-31"),
      createdByWorkflow: "AI-10",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const event = { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedule._id), actingUserId: userId } };
    await Promise.all([runWorkflow(ai10FixedAsset, { ...event, id: undefined }), runWorkflow(ai10FixedAsset, { ...event, id: undefined })]);

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);
  });

  // ── C.3 duplicate business action: asset.created run twice concurrently ───────────────────
  it("concurrent duplicate asset.created dispatch → exactly one depreciation schedule", async () => {
    const assetAccountId = await makeAccount("asset_fixed");
    const depAccountId = await makeAccount("expense_depreciation");
    const userId = await makeUser();
    const asset = await Asset.create({
      tenantId: TENANT,
      name: "Concurrent Server",
      purchaseDate: new Date("2026-01-01"),
      originalValue: 60000,
      salvageValue: 0,
      method: "linear",
      durationYears: 3,
      accounts: { assetAccountId, depreciationAccountId: depAccountId },
      status: "posted",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const event = { tenantId: TENANT, eventKey: "asset.created", payload: { assetId: String(asset._id), actingUserId: userId } };
    await Promise.all([runWorkflow(ai10FixedAsset, { ...event, id: undefined }), runWorkflow(ai10FixedAsset, { ...event, id: undefined })]);

    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT, "sourceRef.id": String(asset._id) });
    expect(scheduleCount).toBe(1);
  });

  // ── C.1 Null/missing + malformed ───────────────────────────────────────────────────────────
  it("malformed bill data (zero amount, absurd date, unicode/HTML description) never crashes and stays below any threshold decision safely", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 30000 }] });
    const invoiceId = await makeBill(`<script>alert(1)</script> 机械设备 مرحبا equipment ${"y".repeat(500)}`, 0);
    await Invoice.findByIdAndUpdate(invoiceId, { invoiceDate: new Date("2099-12-31") });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId } });
    // Zero-amount is still an asset-like line (name contains "equipment") but 0 < any positive
    // threshold — must not be flagged as a candidate, and must not crash on the unicode/HTML text.
    expect(envelope.findings.some((f) => f.title.includes("Capital-expenditure candidate"))).toBe(false);
  });

  // ── C.4 Cross-tenant hostile input (regression for the fixes made in this pass) ───────────
  it("cross-tenant hostile: bill.created carrying another tenant's real invoiceId is refused, not processed under this tenant", async () => {
    const victimInvoiceId = await makeBill("Heavy machinery equipment", 500000, undefined, "INR", OTHER_TENANT);
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 30000 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    await expect(runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: victimInvoiceId } })).rejects.toThrow(/not found/);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-10" }).lean();
    expect(run!.status).toBe("failed"); // fails closed — never reads or acts on another tenant's bill
    expect(run!.findings ?? []).toHaveLength(0);
  });

  it("cross-tenant hostile: asset.created carrying another tenant's real assetId is refused, not processed under this tenant", async () => {
    const assetAccountId = await makeAccount("asset_fixed", OTHER_TENANT);
    const depAccountId = await makeAccount("expense_depreciation", OTHER_TENANT);
    const victimAsset = await Asset.create({
      tenantId: OTHER_TENANT,
      name: "Victim Asset",
      purchaseDate: new Date("2026-01-01"),
      originalValue: 999999,
      salvageValue: 0,
      method: "linear",
      durationYears: 5,
      accounts: { assetAccountId, depreciationAccountId: depAccountId },
      status: "posted",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    await expect(runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "asset.created", payload: { assetId: String(victimAsset._id) } })).rejects.toThrow(/not found/);

    const schedule = await AiSchedule.findOne({ "sourceRef.id": String(victimAsset._id) }).lean();
    expect(schedule).toBeNull(); // no schedule was created against the victim's asset under this tenant
  });

  it("cross-tenant hostile: schedule.due carrying another tenant's real scheduleId is refused, not processed under this tenant", async () => {
    const victimAssetAccountId = await makeAccount("asset_fixed", OTHER_TENANT);
    const victimDepAccountId = await makeAccount("expense_depreciation", OTHER_TENANT);
    const victimAsset = await Asset.create({
      tenantId: OTHER_TENANT,
      name: "Victim Depreciable Asset",
      purchaseDate: new Date("2026-01-01"),
      originalValue: 12000,
      salvageValue: 0,
      method: "linear",
      durationYears: 1,
      accounts: { assetAccountId: victimAssetAccountId, depreciationAccountId: victimDepAccountId },
      status: "posted",
    });
    const victimSchedule = await AiSchedule.create({
      tenantId: OTHER_TENANT,
      scheduleType: "depreciation",
      sourceRef: { model: "Asset", id: String(victimAsset._id) },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 12000,
      currency: "INR",
      debitAccountId: victimDepAccountId,
      creditAccountId: victimAssetAccountId,
      basis: "stated",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 12000,
      nextRunDate: new Date("2026-01-31"),
      createdByWorkflow: "AI-10",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(victimSchedule._id) } });
    expect(envelope.metrics?.scanned ?? 0).toBe(0);
    const journal = await JournalEntry.findOne({}).lean();
    expect(journal).toBeNull();
    const updated = await AiSchedule.findById(victimSchedule._id).lean();
    expect(updated!.periods[0].status).toBe("pending"); // untouched
  });

  // ── C.6 Adversarial: a confidently-wrong "it's clearly capital" trap ──────────────────────
  it("adversarial: a large repair/maintenance bill that merely MENTIONS an asset keyword is still surfaced only as a RECOMMEND-level candidate, never auto-capitalised", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 10000 }] });
    // "Emergency repair to existing machinery" — contains the keyword "machinery" (asset-like)
    // but is really a same-year repair expense, not a new capital asset. A naive keyword-only
    // implementation would confidently draft/create an asset; AI-10's own spec (capital vs.
    // expense is judgement) must keep this at RECOMMEND and never write anything.
    const invoiceId = await makeBill("Emergency repair to existing machinery", 250000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId } });

    const finding = envelope.findings.find((f) => f.title.includes("Capital-expenditure candidate"));
    expect(finding, "keyword match alone still raises it as a candidate for a human to judge").toBeDefined();
    expect(envelope.autonomyApplied).toBe("recommend"); // never auto-decided
    const assetCount = await Asset.countDocuments({ tenantId: TENANT });
    expect(assetCount).toBe(0); // never auto-created — a human must confirm repair vs. capitalise
  });
});

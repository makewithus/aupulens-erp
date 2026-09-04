import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai10";

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

const TENANT = "ai10-tenant";

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeAccount(account_type: string) {
  const acc = await Account.create({ tenantId: TENANT, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeCustomer() {
  const c = await Customer.create({ tenantId: TENANT, header: { name: "Acme Vendor", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeBill(description: string, amount: number, accountId?: string, currencyId = "INR") {
  const partnerId = await makeCustomer();
  const inv = await Invoice.create({
    tenantId: TENANT,
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

describe("AI-10 — Fixed asset intelligence", () => {
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
  });

  it("below-threshold purchase → not flagged as a capital candidate", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 100000 }] });
    const invoiceId = await makeBill("Laptop computer purchase", 50000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId } });

    expect(envelope.findings.some((f) => f.title.includes("Capital-expenditure candidate"))).toBe(false);
  });

  it("above-threshold asset-like purchase → candidate raised", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 30000 }] });
    const invoiceId = await makeBill("Heavy machinery equipment", 500000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId } });

    const finding = envelope.findings.find((f) => f.title.includes("Capital-expenditure candidate"));
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("threshold_configured=true");
  });

  it("non-INR bill → fx_unsupported escalation, not evaluated as a capital candidate", async () => {
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "capitalisation", absoluteAmount: 30000 }] });
    const invoiceId = await makeBill("Heavy machinery equipment", 500000, undefined, "USD");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId } });

    const finding = envelope.findings.find((f) => f.title.includes("fx_unsupported"));
    expect(finding).toBeDefined();
    expect(envelope.findings.some((f) => f.title.includes("Capital-expenditure candidate"))).toBe(false);
  });

  it("no capitalisation threshold configured → RECOMMEND, threshold_configured false, never an invented figure", async () => {
    const invoiceId = await makeBill("New office equipment purchase", 200000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId } });

    const finding = envelope.findings.find((f) => f.title.includes("Capital-expenditure candidate"));
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("threshold_configured=false");
    const assetCount = await Asset.countDocuments({ tenantId: TENANT });
    expect(assetCount).toBe(0); // asset creation is a human decision (RECOMMEND) — never auto-created
  });

  it("asset.created for a POSTED asset with no schedule yet → depreciation schedule created", async () => {
    const assetAccountId = await makeAccount("asset_fixed");
    const depAccountId = await makeAccount("expense_depreciation");
    const userId = await makeUser();
    const asset = await Asset.create({
      tenantId: TENANT,
      name: "Delivery Van",
      purchaseDate: new Date("2026-01-17"),
      originalValue: 120000,
      salvageValue: 0,
      method: "linear",
      durationYears: 5,
      accounts: { assetAccountId, depreciationAccountId: depAccountId },
      status: "posted",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "asset.created", payload: { assetId: String(asset._id), actingUserId: userId } });

    const schedule = await AiSchedule.findOne({ tenantId: TENANT, "sourceRef.id": String(asset._id) }).lean();
    expect(schedule).not.toBeNull();
    expect(schedule!.scheduleType).toBe("depreciation");
    expect(schedule!.status).toBe("approved");
    const sum = schedule!.periods.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(120000);
  });

  it("asset.created run twice → exactly one depreciation schedule (idempotent)", async () => {
    const assetAccountId = await makeAccount("asset_fixed");
    const depAccountId = await makeAccount("expense_depreciation");
    const userId = await makeUser();
    const asset = await Asset.create({
      tenantId: TENANT,
      name: "Server Rack",
      purchaseDate: new Date("2026-01-01"),
      originalValue: 60000,
      salvageValue: 0,
      method: "linear",
      durationYears: 3,
      accounts: { assetAccountId, depreciationAccountId: depAccountId },
      status: "posted",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-10", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "asset.created", payload: { assetId: String(asset._id), actingUserId: userId } });
    await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "asset.created", payload: { assetId: String(asset._id), actingUserId: userId } });

    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT, "sourceRef.id": String(asset._id) });
    expect(scheduleCount).toBe(1);
  });

  it("schedule.due depreciation run → drafts a journal for the due period", async () => {
    const assetAccountId = await makeAccount("asset_fixed");
    const depAccountId = await makeAccount("expense_depreciation");
    const userId = await makeUser();
    const asset = await Asset.create({
      tenantId: TENANT,
      name: "Printer",
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

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedule._id), actingUserId: userId } });

    const updated = await AiSchedule.findById(schedule._id).lean();
    expect(updated!.periods[0].status).toBe("drafted");
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);
    expect(envelope.metrics.policy_overrides).toBe(1); // docs/ai/BRIEF-04-BATCH-C.md Part 0.3
  });

  it("register-to-GL tie-out: a seeded 1-unit difference is detected and reported", async () => {
    const assetAccountId = await makeAccount("asset_fixed");
    const depAccountId = await makeAccount("expense_depreciation");
    const userId = await makeUser();
    const asset = await Asset.create({
      tenantId: TENANT,
      name: "Forklift",
      purchaseDate: new Date("2026-01-01"),
      originalValue: 12000,
      salvageValue: 0,
      method: "linear",
      durationYears: 1,
      accounts: { assetAccountId, depreciationAccountId: depAccountId },
      status: "posted",
    });
    // Seed a capitalisation entry (as a real bill posting would) — deliberately off by 1 unit
    // from the register's originalValue (12000) to prove the tie-out catches a real mismatch.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: `CAP-${Date.now()}`, date: new Date("2026-01-01"), journalType: "general" },
      voucherStatus: "posted",
      status: "posted",
      lineIds: [
        { accountId: assetAccountId, label: "Capitalisation", debit: 12001, credit: 0 },
        { accountId: await makeAccount("liability_current"), label: "Capitalisation", debit: 0, credit: 12001 },
      ],
      totals: { amountUntaxed: 12001, amountTax: 0, amountTotal: 12001 },
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

    const envelope = await runWorkflow(ai10FixedAsset, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedule._id), actingUserId: userId } });

    const finding = envelope.findings.find((f) => f.title.includes("does not tie to GL"));
    expect(finding).toBeDefined();
    expect(finding!.detail).toContain("1");
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai09";

import Account from "@/models/finance/Account";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import SaleOrder from "@/models/sales/SaleOrder";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai09RevenueRecognition: typeof import("@/lib/aiRuntime/workflows/ai-09-revenue-recognition").ai09RevenueRecognition;

const TENANT = "ai09-tenant";

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeAccount(account_type: string) {
  const acc = await Account.create({ tenantId: TENANT, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeCustomer(name = "Beta Customer") {
  const c = await Customer.create({ tenantId: TENANT, header: { name, is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

const SalesInvoiceModel = SalesInvoice as unknown as mongoose.Model<Record<string, unknown>>;

async function makeSalesInvoice(customerId: mongoose.Types.ObjectId, amount: number) {
  const inv = await SalesInvoiceModel.create({
    tenantId: TENANT,
    number: `SI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "Regular",
    customerId,
    invoiceDate: new Date(),
    dueDate: new Date(),
    lineItems: [{ name: "Item", qty: 1, unitPrice: amount, discount: 0, discountMode: "amount", taxRate: 0, lineTotal: amount }],
    taxableAmount: amount,
    totalAmount: amount,
    status: "saved",
  });
  return inv;
}

async function makeSaleOrder(opts: {
  partnerId: mongoose.Types.ObjectId;
  amount: number;
  shipmentStatus?: string;
  salesInvoiceIds?: mongoose.Types.ObjectId[];
  method?: string;
  recognizedAt?: Date;
  name?: string;
}) {
  const order = await SaleOrder.create({
    tenantId: TENANT,
    header: { name: opts.name ?? `SO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, partnerId: opts.partnerId, dateOrder: new Date() },
    orderLines: [{ name: "Service", productQty: 1, priceUnit: opts.amount, taxIds: [], discount: 0, priceSubtotal: opts.amount }],
    totals: { amountUntaxed: opts.amount, amountTax: 0, amountTotal: opts.amount },
    status: "posted",
    q2cStatus: "sales_order",
    shipmentStatus: opts.shipmentStatus,
    salesInvoiceIds: opts.salesInvoiceIds ?? [],
    revenueRecognition: opts.method ? { method: opts.method, recognizedAt: opts.recognizedAt } : undefined,
  });
  return order;
}

describe("AI-09 — Revenue recognition intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      Customer.init(),
      User.init(),
      SaleOrder.init(),
      SalesInvoice.init(),
      JournalEntry.init(),
      AiSchedule.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai09RevenueRecognition } = await import("@/lib/aiRuntime/workflows/ai-09-revenue-recognition"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}),
      Customer.deleteMany({}),
      SaleOrder.deleteMany({}),
      SalesInvoiceModel.deleteMany({}),
      JournalEntry.deleteMany({}),
      AiSchedule.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("structural test: zero mutating ORM calls against models/sales/** from AI-09's folder", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-09-revenue-recognition || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("delivered but never billed → a revenue-leakage finding with the customer named", async () => {
    const partnerId = await makeCustomer("Leakage Customer");
    await makeSaleOrder({ partnerId, amount: 50000, shipmentStatus: "fulfilled" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    const finding = envelope.findings.find((f) => f.title.includes("Revenue leakage"));
    expect(finding).toBeDefined();
    expect(finding!.title).toContain("Leakage Customer");
    expect(finding!.severity).toBe("high");
  });

  it("false positive: a fully delivered, fully billed, fully recognised order produces no findings at all", async () => {
    const partnerId = await makeCustomer();
    const invoice = await makeSalesInvoice(partnerId, 30000);
    await makeSaleOrder({
      partnerId,
      amount: 30000,
      shipmentStatus: "fulfilled",
      salesInvoiceIds: [invoice._id as mongoose.Types.ObjectId],
      method: "point_in_time",
      recognizedAt: new Date(),
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    expect(envelope.findings).toHaveLength(0);
  });

  it("point-in-time: delivered, billed, not yet recognised → drafts a recognition journal", async () => {
    await makeAccount("income");
    await makeAccount("asset_current");
    const userId = await makeUser();
    const partnerId = await makeCustomer();
    const invoice = await makeSalesInvoice(partnerId, 40000);
    await makeSaleOrder({ partnerId, amount: 40000, shipmentStatus: "fulfilled", salesInvoiceIds: [invoice._id as mongoose.Types.ObjectId], method: "point_in_time" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);
  });

  it("milestone basis never auto-recognises, even fully delivered and billed", async () => {
    await makeAccount("income");
    await makeAccount("asset_current");
    const userId = await makeUser();
    const partnerId = await makeCustomer();
    const invoice = await makeSalesInvoice(partnerId, 40000);
    await makeSaleOrder({ partnerId, amount: 40000, shipmentStatus: "fulfilled", salesInvoiceIds: [invoice._id as mongoose.Types.ObjectId], method: "milestone" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0);
  });

  it("billed exceeds recognised → deferred revenue finding", async () => {
    const partnerId = await makeCustomer();
    const invoice = await makeSalesInvoice(partnerId, 20000);
    await makeSaleOrder({ partnerId, amount: 20000, shipmentStatus: "fulfilled", salesInvoiceIds: [invoice._id as mongoose.Types.ObjectId], method: "point_in_time" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    const finding = envelope.findings.find((f) => f.title === "Deferred revenue");
    expect(finding).toBeDefined();
    expect(finding!.amount).toBe(20000);
  });

  it("subscription-keyword order (inferred over_time basis) → a deferred_revenue AiSchedule is created", async () => {
    const deferredAccountId = await makeAccount("liability_current");
    const revenueAccountId = await makeAccount("income");
    const userId = await makeUser();
    const partnerId = await makeCustomer();
    await makeSaleOrder({ partnerId, amount: 120000, name: "Annual subscription plan" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const schedule = await AiSchedule.findOne({ tenantId: TENANT, scheduleType: "deferred_revenue", "sourceRef.model": "SaleOrder" }).lean();
    expect(schedule).not.toBeNull();
    void deferredAccountId;
    void revenueAccountId;
  });

  it("schedule.due on an owned deferred_revenue schedule → drafts a journal, never posts (docs/ai/BRIEF-04-BATCH-C.md Part 0.3 override visible on the envelope)", async () => {
    const deferredAccountId = await makeAccount("liability_current");
    const revenueAccountId = await makeAccount("income");
    const userId = await makeUser();
    const partnerId = await makeCustomer();
    const order = await makeSaleOrder({ partnerId, amount: 12000, name: "Annual subscription plan" });
    const schedule = await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "deferred_revenue",
      sourceRef: { model: "SaleOrder", id: String(order._id) },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 12000,
      currency: "INR",
      debitAccountId: deferredAccountId,
      creditAccountId: revenueAccountId,
      basis: "inferred",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 12000,
      nextRunDate: new Date("2026-01-31"),
      createdByWorkflow: "AI-09",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedule._id), actingUserId: userId } });

    const updated = await AiSchedule.findById(schedule._id).lean();
    expect(updated!.periods[0].status).toBe("drafted");
    const journal = await JournalEntry.findOne({ tenantId: TENANT }).lean();
    expect(journal).not.toBeNull();
    expect(journal!.status).toBe("draft"); // never posted, per spec
    expect(envelope.metrics.policy_overrides).toBe(1);
  });
});

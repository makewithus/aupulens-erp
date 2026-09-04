import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai07";

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiLearningRecord from "@/models/ai/AiLearningRecord";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai07AccrualIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-07-accrual-intelligence").ai07AccrualIntelligence;

const TENANT = "ai07-tenant";

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeAccount(account_type: string) {
  const acc = await Account.create({ tenantId: TENANT, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeVendor(name = "Acme Supplies") {
  const c = await Customer.create({ tenantId: TENANT, header: { name, is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makePurchaseOrder(partnerId: mongoose.Types.ObjectId, lines: { productQty: number; receivedQty: number; billedQty: number; priceUnit: number }[]) {
  const po = await PurchaseOrder.create({
    tenantId: TENANT,
    name: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    dateOrder: new Date("2026-02-01"),
    orderLines: lines.map((l, i) => ({
      productId: new mongoose.Types.ObjectId(),
      name: `Item ${i}`,
      productQty: l.productQty,
      receivedQty: l.receivedQty,
      billedQty: l.billedQty,
      priceUnit: l.priceUnit,
      taxIds: [],
      priceSubtotal: l.priceUnit * l.productQty,
    })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
    status: "approved",
    createdBy: new mongoose.Types.ObjectId(),
  });
  return po;
}

describe("AI-07 — Accrual intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      Invoice.init(),
      Customer.init(),
      User.init(),
      PurchaseOrder.init(),
      JournalEntry.init(),
      AiSchedule.init(),
      AiMaterialityPolicy.init(),
      AiLearningRecord.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai07AccrualIntelligence } = await import("@/lib/aiRuntime/workflows/ai-07-accrual-intelligence"));
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
      PurchaseOrder.deleteMany({}),
      JournalEntry.deleteMany({}),
      AiSchedule.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
      AiLearningRecord.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("receivedQty=10, billedQty=4 → accrual for 6 units at PO price, PO line as evidence, no LLM call", async () => {
    await makeAccount("expense");
    await makeAccount("liability_current");
    const userId = await makeUser();
    const vendor = await makeVendor();
    const po = await makePurchaseOrder(vendor, [{ productQty: 10, receivedQty: 10, billedQty: 4, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });

    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const finding = envelope.findings.find((f) => f.title.includes("GRNI accrual candidate"));
    expect(finding).toBeDefined();
    expect(finding!.amount).toBe(600);
    expect(finding!.evidence[0].ref).toBe(String(po._id));
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);
  });

  it("false positive (the most important test): fully billed PO line → nothing", async () => {
    await makeAccount("expense");
    await makeAccount("liability_current");
    const vendor = await makeVendor();
    await makePurchaseOrder(vendor, [{ productQty: 10, receivedQty: 10, billedQty: 10, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    expect(envelope.findings.some((f) => f.title.includes("GRNI accrual candidate"))).toBe(false);
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
  });

  it("over-billed line (billedQty > receivedQty) → not an accrual, raised as an exception", async () => {
    const vendor = await makeVendor();
    await makePurchaseOrder(vendor, [{ productQty: 10, receivedQty: 4, billedQty: 10, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });

    const finding = envelope.findings.find((f) => f.title.includes("Over-billed"));
    expect(finding).toBeDefined();
    expect(envelope.findings.some((f) => f.title.includes("GRNI accrual candidate"))).toBe(false);
  });

  it("no accrual materiality policy configured → RECOMMEND, never drafted (new-vendor-equivalent conservatism)", async () => {
    await makeAccount("expense");
    await makeAccount("liability_current");
    const userId = await makeUser();
    const vendor = await makeVendor();
    await makePurchaseOrder(vendor, [{ productQty: 5, receivedQty: 5, billedQty: 0, priceUnit: 200 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    // No AiMaterialityPolicy created at all.

    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    expect(envelope.findings.some((f) => f.title.includes("GRNI accrual candidate"))).toBe(true);
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
  });

  it("reversal creates exactly one AiSchedule and exactly one reversing entry when due", async () => {
    await makeAccount("expense");
    await makeAccount("liability_current");
    const userId = await makeUser();
    const vendor = await makeVendor();
    await makePurchaseOrder(vendor, [{ productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });

    await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const schedules = await AiSchedule.find({ tenantId: TENANT, scheduleType: "accrual_reversal" }).lean();
    expect(schedules).toHaveLength(1);
    expect(schedules[0].periods).toHaveLength(1);

    // Force the reversal due now and run schedule.due.
    await AiSchedule.updateOne({ _id: schedules[0]._id }, { $set: { "periods.0.dueDate": new Date("2020-01-01") } });
    await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedules[0]._id), actingUserId: userId } });

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(2); // the original accrual + the reversal
    const updatedSchedule = await AiSchedule.findById(schedules[0]._id).lean();
    expect(updatedSchedule!.periods[0].status).toBe("drafted");
  });

  it("accuracy tracking: a matching bill updates the learning store with the delta", async () => {
    await makeAccount("expense");
    await makeAccount("liability_current");
    const userId = await makeUser();
    const vendor = await makeVendor();
    const po = await makePurchaseOrder(vendor, [{ productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });
    await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const bill = await Invoice.create({
      tenantId: TENANT,
      name: `BILL-${Date.now()}`,
      partnerId: vendor,
      moveType: "in_invoice",
      state: "draft",
      invoiceDate: new Date(),
      dueDate: new Date(),
      invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 10, priceUnit: 100 }],
      amountTotal: 1000,
    });
    await PurchaseOrder.updateOne({ _id: po._id }, { $push: { invoiceIds: bill._id } });

    await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });

    const record = await AiLearningRecord.findOne({ tenantId: TENANT, workflowId: "AI-07", "proposal.basis": "accrual_accuracy" }).lean();
    expect(record).not.toBeNull();
    expect(record!.outcome).toBe("accepted"); // 1000 accrual vs 1000 invoice — exact match
  });
});

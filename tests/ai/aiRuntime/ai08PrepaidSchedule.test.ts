import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai08";

import Account from "@/models/finance/Account";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule from "@/models/ai/AiSchedule";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai08PrepaidSchedule: typeof import("@/lib/aiRuntime/workflows/ai-08-prepaid-schedule").ai08PrepaidSchedule;

const TENANT = "ai08-tenant";

async function makeUser() {
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

async function makeAccount(account_type: string) {
  const acc = await Account.create({
    tenantId: TENANT,
    name: `Account ${account_type}`,
    code: `ACC-${Math.random().toString(36).slice(2, 8)}`,
    account_type,
    isActive: true,
    isLocked: false,
    status: "active",
  });
  return String(acc._id);
}

async function makeCustomer() {
  const c = await Customer.create({ tenantId: TENANT, header: { name: "Acme Vendor", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeBill(description: string, amount: number, invoiceDate: Date, accountId?: string, currencyId = "INR") {
  const partnerId = await makeCustomer();
  const inv = await Invoice.create({
    tenantId: TENANT,
    name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    moveType: "in_invoice",
    state: "draft",
    invoiceDate,
    dueDate: invoiceDate,
    invoiceLines: [{ name: description, priceSubtotal: amount, quantity: 1, priceUnit: amount, accountId: accountId ? new mongoose.Types.ObjectId(accountId) : undefined }],
    amountTotal: amount,
    currencyId,
  });
  return String(inv._id);
}

describe("AI-08 — Prepaid/deferred schedule intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      Invoice.init(),
      Customer.init(),
      User.init(),
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
    ({ ai08PrepaidSchedule } = await import("@/lib/aiRuntime/workflows/ai-08-prepaid-schedule"));
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
      JournalEntry.deleteMany({}),
      AiSchedule.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
    ]);
  });

  it("false positive (the most important test): a one-month rent bill with no cross-period span → no schedule created", async () => {
    const prepaidAccountId = await makeAccount("asset_prepayments");
    const invoiceId = await makeBill("Office rent for the month", 20000, new Date("2026-02-01"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.3 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId } });

    expect(envelope.findings).toHaveLength(0);
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0);
    void prepaidAccountId;
  });

  it("stated 12-month span with an acting user and killSwitch on → schedule drafted, periods sum to totalAmount", async () => {
    await makeAccount("asset_prepayments");
    const userId = await makeUser();
    const invoiceId = await makeBill("Prepaid insurance for 12 months", 120000, new Date("2026-01-17"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.9 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    expect(envelope.findings.some((f) => f.title.includes("candidate"))).toBe(true);
    const schedule = await AiSchedule.findOne({ tenantId: TENANT, "sourceRef.id": invoiceId }).lean();
    expect(schedule).not.toBeNull();
    expect(schedule!.status).toBe("draft");
    const sum = schedule!.periods.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(120000);
  });

  it("non-INR document → fx_unsupported escalation, no schedule created", async () => {
    await makeAccount("asset_prepayments");
    const userId = await makeUser();
    const invoiceId = await makeBill("Prepaid insurance for 12 months", 120000, new Date("2026-01-17"), undefined, "USD");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    const finding = envelope.findings.find((f) => f.title.includes("fx_unsupported"));
    expect(finding).toBeDefined();
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0);
  });

  it("no prepaid/deferred account configured → escalation, no schedule created", async () => {
    const userId = await makeUser();
    const invoiceId = await makeBill("Annual subscription for software", 60000, new Date("2026-03-01"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    const finding = envelope.findings.find((f) => f.title.includes("No prepaid/deferred account"));
    expect(finding).toBeDefined();
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0);
  });

  it("an inferred (keyword-only) candidate never auto-drafts regardless of confidence threshold", async () => {
    await makeAccount("asset_prepayments");
    const userId = await makeUser();
    const invoiceId = await makeBill("Annual AMC contract", 50000, new Date("2026-04-01"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0);
  });

  it("schedule.due execute: drafts a journal for the due period and links it (autoPostSchedules=false)", async () => {
    const prepaidAccountId = await makeAccount("asset_prepayments");
    const expenseAccountId = await makeAccount("expense");
    const userId = await makeUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const schedule = await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "prepaid",
      sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId().toString() },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 12000,
      currency: "INR",
      debitAccountId: expenseAccountId,
      creditAccountId: prepaidAccountId,
      basis: "stated",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 12000,
      nextRunDate: new Date("2026-01-31"),
      createdByWorkflow: "AI-08",
    });

    const envelope = await runWorkflow(ai08PrepaidSchedule, {
      tenantId: TENANT,
      eventKey: "schedule.due",
      payload: { scheduleId: String(schedule._id), actingUserId: userId },
    });

    const updated = await AiSchedule.findById(schedule._id).lean();
    expect(updated!.periods[0].status).toBe("drafted");
    expect(updated!.periods[0].journalEntryId).toBeDefined();
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);

    // docs/ai/BRIEF-04-BATCH-C.md Part 0.3 — the allowNonStandard use this run made is visible
    // on the envelope's metrics and named in the trace's reason chain, not just passed silently.
    expect(envelope.metrics.policy_overrides).toBe(1);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace!.reasonChain.some((r) => r.includes("amortisation") && r.includes("2026-01"))).toBe(true);
  });

  it("schedule.due run twice → the period only drafts once (compare-and-swap idempotency)", async () => {
    const prepaidAccountId = await makeAccount("asset_prepayments");
    const expenseAccountId = await makeAccount("expense");
    const userId = await makeUser();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const schedule = await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "prepaid",
      sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId().toString() },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 12000,
      currency: "INR",
      debitAccountId: expenseAccountId,
      creditAccountId: prepaidAccountId,
      basis: "stated",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 12000,
      nextRunDate: new Date("2026-01-31"),
      createdByWorkflow: "AI-08",
    });

    await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedule._id), actingUserId: userId } });
    await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedule._id), actingUserId: userId } });

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);
  });

  it("cancelled source document → schedule not run, escalation raised", async () => {
    const prepaidAccountId = await makeAccount("asset_prepayments");
    const expenseAccountId = await makeAccount("expense");
    const userId = await makeUser();
    const invoiceId = await makeBill("Prepaid insurance for 12 months", 120000, new Date("2026-01-01"));
    await Invoice.updateOne({ _id: invoiceId }, { $set: { state: "cancelled" } });

    const schedule = await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "prepaid",
      sourceRef: { model: "Invoice", id: invoiceId },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 12000,
      currency: "INR",
      debitAccountId: expenseAccountId,
      creditAccountId: prepaidAccountId,
      basis: "stated",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }],
      recognisedToDate: 0,
      remaining: 12000,
      nextRunDate: new Date("2026-01-31"),
      createdByWorkflow: "AI-08",
    });

    const envelope = await runWorkflow(ai08PrepaidSchedule, {
      tenantId: TENANT,
      eventKey: "schedule.due",
      payload: { scheduleId: String(schedule._id), actingUserId: userId },
    });

    expect(envelope.findings.some((f) => f.title.includes("cancelled"))).toBe(true);
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
  });
});

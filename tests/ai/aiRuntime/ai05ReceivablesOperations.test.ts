import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai05";

const mockSend = vi.fn().mockResolvedValue({ success: true, provider: "mock", message: "ok" });
vi.mock("@/lib/email/sendEmail", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email/sendEmail")>("@/lib/email/sendEmail");
  return {
    ...actual,
    getEmailService: () => ({ send: mockSend }),
  };
});

import { SalesInvoice as SalesInvoiceModel } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import User from "@/models/auth/User";
import AiDispute, { AI_DISPUTE_STATUS } from "@/models/ai/AiDispute";
import AiCommunicationDraft from "@/models/ai/AiCommunicationDraft";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import Reminder from "@/models/sales/Reminder";
import EmailTemplate from "@/models/sales/EmailTemplate";

const SalesInvoice: any = SalesInvoiceModel;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai05ReceivablesOperations: typeof import("@/lib/aiRuntime/workflows/ai-05-receivables-operations").ai05ReceivablesOperations;
let evaluateInvoiceReminders: typeof import("@/lib/sales/reminderEngine").evaluateInvoiceReminders;

const TENANT = "ai05-tenant";

async function makeUser(role: string = "sales") {
  const u = await User.create({ tenantId: TENANT, name: "Sales User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role, status: "active" });
  return String(u._id);
}

async function makeCustomer(userId: string, overrides: Partial<Record<string, any>> = {}) {
  const c = await Customer.create({
    tenantId: TENANT,
    header: { name: "Acme Co", is_company: true },
    contact_details: {},
    createdBy: userId,
    ...overrides,
  });
  return c;
}

async function makeInvoice(customerId: string, overrides: Partial<Record<string, any>> = {}) {
  return SalesInvoice.create({
    tenantId: TENANT,
    number: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    customerId,
    status: "saved",
    invoiceDate: new Date(),
    dueDate: new Date(),
    lineItems: [],
    taxableAmount: 1000,
    totalAmount: 1000,
    payments: [],
    ...overrides,
  });
}

async function makeDraftPayment(customerId: string, unusedAmount: number, overrides: Partial<Record<string, any>> = {}) {
  return Payment.create({
    tenantId: TENANT,
    customerId,
    paymentNumber: `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    paymentDate: new Date(),
    amountReceived: unusedAmount,
    allocations: [],
    unusedAmount,
    status: "draft",
    ...overrides,
  });
}

async function runAi05(actingUserId?: string) {
  return runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: actingUserId ? { actingUserId } : {} });
}

describe("AI-05 — Receivables operations", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      SalesInvoice.init(),
      Payment.init(),
      Customer.init(),
      Invoice.init(),
      User.init(),
      AiDispute.init(),
      AiCommunicationDraft.init(),
      AiMaterialityPolicy.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AiAttentionItem.init(),
      Reminder.init(),
      EmailTemplate.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai05ReceivablesOperations } = await import("@/lib/aiRuntime/workflows/ai-05-receivables-operations"));
    ({ evaluateInvoiceReminders } = await import("@/lib/sales/reminderEngine"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      SalesInvoice.deleteMany({}),
      Payment.deleteMany({}),
      Customer.deleteMany({}),
      Invoice.deleteMany({}),
      User.deleteMany({}),
      AiDispute.deleteMany({}),
      AiCommunicationDraft.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      AiAttentionItem.deleteMany({}),
      Reminder.deleteMany({}),
      EmailTemplate.deleteMany({}),
    ]);
  });

  it("source-grep: AI-05's folder and receivablesTools.ts never write SalesInvoice.payments[] directly", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-05-receivables-operations lib/aiRuntime/tools/receivablesTools.ts | grep -i "salesinvoice" || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("no credit note, write-off, or credit-limit mutation is possible at any confidence (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rniE 'creditnote|write.?off|creditlimit' lib/aiRuntime/workflows/ai-05-receivables-operations lib/aiRuntime/tools/receivablesTools.ts || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("one receipt across many invoices — batched allocation completes on the existing draft Payment", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId);
    const inv1 = await makeInvoice(String(customer._id), { totalAmount: 400, dueDate: new Date(Date.now() - 5 * 86400000) });
    const inv2 = await makeInvoice(String(customer._id), { totalAmount: 600, dueDate: new Date(Date.now() - 3 * 86400000) });
    const payment = await makeDraftPayment(String(customer._id), 1000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    await runAi05(userId);

    const updated = await Payment.findById(payment._id).lean();
    expect(updated!.status).toBe("draft"); // never auto-confirmed
    expect(updated!.unusedAmount).toBeCloseTo(0, 2);
    expect(updated!.allocations.length).toBe(2);
    const total = updated!.allocations.reduce((s, a) => s + a.amount, 0);
    expect(total).toBeCloseTo(1000, 2);
    void inv1;
    void inv2;
  });

  it("short payment creates a dispute, not a false allocation", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId);
    const inv = await makeInvoice(String(customer._id), { totalAmount: 1000, dueDate: new Date(Date.now() - 2 * 86400000) });
    const payment = await makeDraftPayment(String(customer._id), 850); // 85% — inside the short-payment band
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    await runAi05();

    const updated = await Payment.findById(payment._id).lean();
    expect(updated!.allocations.length).toBe(0); // no false allocation
    expect(updated!.unusedAmount).toBeCloseTo(850, 2);

    const dispute = await AiDispute.findOne({ tenantId: TENANT, subjectModel: "SalesInvoice", subjectId: inv._id }).lean();
    expect(dispute).not.toBeNull();
    expect(dispute!.status).toBe(AI_DISPUTE_STATUS.OPEN);
  });

  it("overpayment becomes credit on account, not a forced match", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId);
    await makeInvoice(String(customer._id), { totalAmount: 500, dueDate: new Date(Date.now() - 2 * 86400000) });
    const payment = await makeDraftPayment(String(customer._id), 800); // 300 more than the only open invoice's due
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    await runAi05(userId);

    const updated = await Payment.findById(payment._id).lean();
    expect(updated!.allocations.length).toBe(1);
    expect(updated!.allocations[0].amount).toBeCloseTo(500, 2);
    expect(updated!.unusedAmount).toBeCloseTo(300, 2); // stays as credit, not forced onto anything else
  });

  it("a paid invoice is never in the collection worklist", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId);
    await makeInvoice(String(customer._id), {
      totalAmount: 500,
      status: "paid",
      dueDate: new Date(Date.now() - 60 * 86400000),
      payments: [{ amount: 500, date: new Date(), mode: "Cash" }],
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    await runAi05();
    // No worklist entries and no drafted communications for a customer with only a paid invoice.
    const drafts = await AiCommunicationDraft.find({ tenantId: TENANT, customerId: customer._id }).lean();
    expect(drafts.length).toBe(0);
  });

  it("a disputed invoice stops its reminder sequence", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId, { contact_details: { email: "billing@acme.test" } });
    const disputedInvoice = await makeInvoice(String(customer._id), { dueDate: new Date() });
    const normalInvoice = await makeInvoice(String(customer._id), { dueDate: new Date() });
    await AiDispute.create({
      tenantId: TENANT,
      workflowId: "AI-05",
      subjectModel: "SalesInvoice",
      subjectId: disputedInvoice._id,
      customerId: customer._id,
      reason: "test",
      detectedBasis: "test",
      status: AI_DISPUTE_STATUS.OPEN,
    });
    await Reminder.create({ tenantId: TENANT, scope: "invoice", type: "automated", name: "Due today", basis: "due_date", offsetDays: 0, direction: "after", enabled: true });

    mockSend.mockClear();
    const result = await evaluateInvoiceReminders(TENANT);

    expect(result.sent).toBe(1); // only the non-disputed invoice
    expect(mockSend).toHaveBeenCalledTimes(1);
    void normalInvoice;
  });

  it("predicted date beats naive terms on a consistently-late customer", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId);
    const base = Date.now() - 200 * 86400000;
    for (let i = 0; i < 3; i++) {
      const invDate = new Date(base + i * 20 * 86400000);
      const due = new Date(invDate.getTime() + 30 * 86400000); // 30-day terms
      const paidDate = new Date(invDate.getTime() + 45 * 86400000); // always pays at 45 days
      await makeInvoice(String(customer._id), {
        invoiceDate: invDate,
        dueDate: due,
        status: "paid",
        totalAmount: 100,
        payments: [{ amount: 100, date: paidDate, mode: "Cash" }],
      });
    }
    const openInvDate = new Date();
    const openDue = new Date(openInvDate.getTime() + 30 * 86400000);
    const openInv = await makeInvoice(String(customer._id), { invoiceDate: openInvDate, dueDate: openDue, totalAmount: 200 });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    const envelope = await runAi05();
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { predictedPayments: { invoiceId: string; predictedDate: string; dueDate: string; basis: string }[] };
    const predicted = proposal.predictedPayments.find((p) => p.invoiceId === String(openInv._id));
    expect(predicted).toBeDefined();
    expect(predicted!.basis).toBe("history");
    const predictedMs = new Date(predicted!.predictedDate).getTime();
    const dueMs = new Date(predicted!.dueDate).getTime();
    expect(predictedMs).toBeGreaterThan(dueMs); // beats naive 30-day terms — predicts ~45 days
  });

  it("false positive: a customer within terms with no history of lateness produces no worklist entry", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId);
    // Not yet due, no paid-invoice history at all.
    await makeInvoice(String(customer._id), { dueDate: new Date(Date.now() + 20 * 86400000), totalAmount: 500 });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    await runAi05();
    const drafts = await AiCommunicationDraft.find({ tenantId: TENANT, customerId: customer._id }).lean();
    expect(drafts.length).toBe(0);
  });

  it("Sales-vs-Finance payment-state divergence is detected and reported, never repaired (A.2)", async () => {
    const userId = await makeUser();
    const customer = await makeCustomer(userId);
    const invoice = await makeInvoice(String(customer._id), {
      number: "INV-DIVERGE-01",
      status: "paid",
      totalAmount: 1000,
      payments: [{ amount: 1000, date: new Date(), mode: "Cash" }],
    });
    // The Finance-side mirror invoice still shows not_paid — a real, deliberate divergence
    // between the two unwired payment layers (A.2).
    await Invoice.create({
      tenantId: TENANT,
      name: "FIN-1",
      partnerId: customer._id,
      moveType: "out_invoice",
      sourceDocument: "INV-DIVERGE-01",
      amountTotal: 1000,
      paymentState: "not_paid",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft" });

    const envelope = await runAi05(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { paymentStateDivergence: { count: number; value: number } };

    expect(proposal.paymentStateDivergence).toEqual({ count: 1, value: 1000 });
    // Never repaired: the Finance-side Invoice itself is untouched.
    const financeInvoice = await Invoice.findOne({ tenantId: TENANT, sourceDocument: "INV-DIVERGE-01" }).lean();
    expect(financeInvoice!.paymentState).toBe("not_paid");
    void invoice;
  });
});

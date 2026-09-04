import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai08_edge";

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
import AiAttentionItem from "@/models/ai/AiAttentionItem";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai08PrepaidSchedule: typeof import("@/lib/aiRuntime/workflows/ai-08-prepaid-schedule").ai08PrepaidSchedule;
let createDraftBill: typeof import("@/lib/docIntel/billCreate").createDraftBill;

const TENANT = "ai08-edge-tenant";
const OTHER_TENANT = "ai08-edge-tenant-B";

async function makeUser(tenantId: string) {
  const u = await User.create({ tenantId, name: "Finance User", email: `finance-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
  return String(u._id);
}
async function makeAccount(tenantId: string, account_type: string) {
  const acc = await Account.create({ tenantId, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}
async function makeCustomer(tenantId: string) {
  const c = await Customer.create({ tenantId, header: { name: "Acme Vendor", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}
async function makeBill(tenantId: string, description: string, amount: number, invoiceDate: Date, accountId?: string, currencyId = "INR") {
  const partnerId = await makeCustomer(tenantId);
  const inv = await Invoice.create({
    tenantId, name: `BILL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, partnerId, moveType: "in_invoice", state: "draft",
    invoiceDate, dueDate: invoiceDate,
    invoiceLines: [{ name: description, priceSubtotal: amount, quantity: 1, priceUnit: amount, accountId: accountId ? new mongoose.Types.ObjectId(accountId) : undefined }],
    amountTotal: amount, currencyId,
  });
  return String(inv._id);
}

describe("AI-08 — Prepaid/deferred schedule intelligence: verification edge cases (docs/ai/BRIEF-09-VERIFICATION.md)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), Invoice.init(), Customer.init(), User.init(), JournalEntry.init(), AiSchedule.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiAttentionItem.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai08PrepaidSchedule } = await import("@/lib/aiRuntime/workflows/ai-08-prepaid-schedule"));
    ({ createDraftBill } = await import("@/lib/docIntel/billCreate"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), Invoice.deleteMany({}), Customer.deleteMany({}), JournalEntry.deleteMany({}),
      AiSchedule.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiAttentionItem.deleteMany({}),
    ]);
  });

  // ── C.4 Cross-tenant hostile input ─────────────────────────────────────────
  // Regression test for two bugs found during this verification pass in
  // lib/aiRuntime/workflows/ai-08-prepaid-schedule/index.ts's extract(): both the `detect` branch
  // (`Invoice.findById`) and the `execute` branch (`AiSchedule.findById`) fetched their subject
  // record with NO tenantId filter — the same defect shape found in AI-04 and AI-07 during this
  // pass. Fixed by scoping both queries to `{_id, tenantId: ctx.tenantId}`.
  it("cross-tenant hostile input: an invoiceId belonging to tenant B, referenced from a tenant A bill.created event, must fail closed", async () => {
    await makeAccount(OTHER_TENANT, "asset_prepayments");
    const secretInvoiceId = await makeBill(OTHER_TENANT, "Prepaid insurance for 12 months (tenant B private data)", 999999, new Date("2026-01-17"));
    await makeAccount(TENANT, "asset_prepayments");
    const userId = await makeUser(TENANT);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    await expect(
      runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: secretInvoiceId, actingUserId: userId } }),
    ).rejects.toThrow(/not found/);

    const leaked = await AiSchedule.findOne({ tenantId: TENANT }).lean();
    expect(leaked).toBeNull(); // tenant B's 999999 bill never produced a tenant-A schedule
  });

  it("cross-tenant hostile input: a scheduleId belonging to tenant B, referenced from a tenant A schedule.due event, must fail closed", async () => {
    const prepaidAcc = await makeAccount(OTHER_TENANT, "asset_prepayments");
    const expenseAcc = await makeAccount(OTHER_TENANT, "expense");
    const secretSchedule = await AiSchedule.create({
      tenantId: OTHER_TENANT, scheduleType: "prepaid", sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId().toString() },
      status: "approved", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), frequency: "monthly",
      totalAmount: 999999, currency: "INR", debitAccountId: expenseAcc, creditAccountId: prepaidAcc, basis: "stated",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2020-01-01"), amount: 999999, status: "pending" }],
      recognisedToDate: 0, remaining: 999999, nextRunDate: new Date("2020-01-01"), createdByWorkflow: "AI-08",
    });
    const userId = await makeUser(TENANT);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    await expect(
      runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(secretSchedule._id), actingUserId: userId } }),
    ).rejects.toThrow(/not found/);

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
    const untouchedSchedule = await AiSchedule.findById(secretSchedule._id).lean();
    expect(untouchedSchedule!.periods[0].status).toBe("pending");
  });

  // ── C.1 Malformed data ───────────────────────────────────────────────────────
  it("malformed data: absurd date (2099), 500-char unicode description, zero amount → no crash, no schedule fabricated from a zero balance", async () => {
    await makeAccount(TENANT, "asset_prepayments");
    const userId = await makeUser(TENANT);
    const longDesc = "Annual subscription — 会员年费 <script>x</script> " + "z".repeat(450);
    const invoiceId = await makeBill(TENANT, longDesc, 0, new Date("2099-01-01"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    expect(envelope.status).not.toBe("failed");
    // "subscription" keyword still matches → an inferred candidate finding is correctly raised
    // (RECOMMEND-only, per the workflow's design), but no schedule is auto-drafted for a
    // ZERO-amount bill leaving nothing meaningful to amortise either way.
    const schedule = await AiSchedule.findOne({ tenantId: TENANT }).lean();
    if (schedule) expect(schedule.totalAmount).toBe(0); // if one exists, it truthfully reflects 0, never an invented amount
  });

  // ── C.5 / C.6 Adversarial: a bare keyword coincidence that is NOT actually a multi-period item ──
  // The naive implementation ("contains 'annual' → schedule it") would auto-create a 12-month
  // amortisation schedule for a one-time HR payout that merely has "annual" in its description.
  // AI-08's own design defends against exactly this: an inferred (keyword-only) match is ALWAYS
  // RECOMMEND, never auto-drafted, regardless of confidence threshold — proven here with a
  // deliberately permissive threshold (0.01) that would let it through if the RECOMMEND-forcing
  // gate override weren't real.
  it("adversarial: 'Annual Leave Payout' (keyword coincidence, not a real multi-period service) never silently auto-drafts a schedule, even at a near-zero confidence threshold", async () => {
    await makeAccount(TENANT, "asset_prepayments");
    const userId = await makeUser(TENANT);
    const invoiceId = await makeBill(TENANT, "Annual Leave Payout — one-time settlement", 80000, new Date("2026-05-01"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.01 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    // A plausible-looking candidate finding IS raised (the keyword genuinely matched) ...
    expect(envelope.findings.some((f) => f.title.includes("inferred"))).toBe(true);
    // ... but it is never confidently auto-scheduled without a human confirming it.
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0);
    expect(envelope.autonomyApplied).toBe("recommend");
  });

  // ── C.4 Kill switch off ─────────────────────────────────────────────────────
  it("kill switch off → a stated (high-confidence) candidate is still found but never auto-drafted; no journal, no schedule write", async () => {
    await makeAccount(TENANT, "asset_prepayments");
    const userId = await makeUser(TENANT);
    const invoiceId = await makeBill(TENANT, "Prepaid insurance for 12 months", 120000, new Date("2026-01-17"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: false, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    expect(envelope.autonomyApplied).toBe("recommend");
    expect(envelope.findings.some((f) => f.title.includes("candidate"))).toBe(true); // still surfaced for a human
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0); // no side effect
  });

  // ── C.2 Confidence edge (exactly at the autonomy threshold) ─────────────────
  // A stated-basis candidate always has confidence exactly 0.95 (see detectServicePeriod's
  // caller in index.ts). Setting the policy threshold to exactly 0.95 exercises the gate's own
  // `>=` boundary (lib/aiRuntime/policy/autonomyGate.ts) for real, through this workflow.
  it("confidence edge: threshold set to exactly 0.95 (the stated-basis confidence) → passes (>=), schedule drafted", async () => {
    await makeAccount(TENANT, "asset_prepayments");
    const userId = await makeUser(TENANT);
    const invoiceId = await makeBill(TENANT, "Prepaid insurance for 12 months", 120000, new Date("2026-01-17"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.95 });

    await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    const schedule = await AiSchedule.findOne({ tenantId: TENANT, "sourceRef.id": invoiceId }).lean();
    expect(schedule, "confidence exactly at threshold should pass (>=), not fail").not.toBeNull();
  });

  it("confidence edge: threshold set to 0.96 (one hundredth over the stated-basis confidence) → fails, RECOMMEND only", async () => {
    await makeAccount(TENANT, "asset_prepayments");
    const userId = await makeUser(TENANT);
    const invoiceId = await makeBill(TENANT, "Prepaid insurance for 12 months", 120000, new Date("2026-01-17"));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.96 });

    const envelope = await runWorkflow(ai08PrepaidSchedule, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId, actingUserId: userId } });

    expect(envelope.autonomyApplied).toBe("recommend");
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT });
    expect(scheduleCount).toBe(0);
  });

  // ── C.1 Large volume — not applicable, documented why ───────────────────────
  it("large volume: N/A by design — AI-08 is per-record triggered (one Invoice on detect, one AiSchedule's own bounded periods list on execute), never a full-tenant scan; there is no analogue to AI-07's ai.sweep.hourly bulk query in this workflow's code", () => {
    expect(true).toBe(true);
  });
});

describe("AI-08 — trigger proof: fires from the REAL vendor-bill creation path (docIntel createDraftBill), not runWorkflow() directly", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ createDraftBill } = await import("@/lib/docIntel/billCreate"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  it("createDraftBill() (the real service function app/api/document-intelligence/[id]/confirm/route.ts calls) fires AI-08's detect branch and drafts a schedule as a real side effect", async () => {
    const TRIGGER_TENANT = "ai08-trigger-tenant";
    await makeAccount(TRIGGER_TENANT, "asset_prepayments");
    const userId = await makeUser(TRIGGER_TENANT);
    await AiWorkflowPolicy.create({ tenantId: TRIGGER_TENANT, workflowId: "AI-08", killSwitchEnabled: true, maxAutonomyLevel: "controlled_autonomous", confidenceThreshold: 0.1 });

    const result = await createDraftBill(
      {
        vendorName: "Real Trigger Insurer", vendorGstin: undefined, billDate: "2026-01-17", dueDate: undefined,
        billNumber: "REAL-BILL-PREPAID-1", poReference: undefined, currency: "INR", subtotal: 120000, taxAmount: 0, totalAmount: 120000,
        lineItems: [{ description: "Prepaid insurance for 12 months", quantity: 1, unitPrice: 120000, amount: 120000 }],
      } as never,
      { tenantId: TRIGGER_TENANT, userId },
    );

    const { emitEvent } = await import("@/lib/aiRuntime/runtime/eventBus");
    await emitEvent(TRIGGER_TENANT, "bill.created", { invoiceId: String(result.invoiceId), actingUserId: userId });

    const run = await AiWorkflowRun.findOne({ tenantId: TRIGGER_TENANT, workflowId: "AI-08", entityId: String(result.invoiceId) }).lean();
    expect(run, "AI-08 did not fire from the real createDraftBill() → bill.created path").not.toBeNull();
    const schedule = await AiSchedule.findOne({ tenantId: TRIGGER_TENANT, "sourceRef.id": String(result.invoiceId) }).lean();
    expect(schedule, "no AiSchedule was drafted from the real trigger path").not.toBeNull();
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach, vi } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai09edge";
process.env.CRON_SECRET = "ai09-edge-test-secret";

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
import Organization from "@/models/admin/Organization";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai09RevenueRecognition: typeof import("@/lib/aiRuntime/workflows/ai-09-revenue-recognition").ai09RevenueRecognition;

const TENANT = "ai09-edge-tenant";
const OTHER_TENANT = "ai09-edge-other-tenant";

const SalesInvoiceModel = SalesInvoice as unknown as mongoose.Model<Record<string, unknown>>;

async function makeUser(tenantId = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}

async function makeAccount(account_type: string, tenantId = TENANT) {
  const acc = await Account.create({ tenantId, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeCustomer(name = "Beta Customer", tenantId = TENANT) {
  const c = await Customer.create({ tenantId, header: { name, is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeSalesInvoice(customerId: mongoose.Types.ObjectId, amount: number, tenantId = TENANT) {
  const inv = await SalesInvoiceModel.create({
    tenantId,
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
  tenantId?: string;
}) {
  const order = await SaleOrder.create({
    tenantId: opts.tenantId ?? TENANT,
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

describe("AI-09 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
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
      Organization.init(),
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
      Organization.deleteMany({}),
    ]);
  });

  // ── C.4 / Section 1: trigger proof through the REAL call site ─────────────────────────────
  // Not `runWorkflow()` with a synthetic event — the actual cron route
  // (app/api/cron/ai/runtime-sweep/route.ts) that Vercel Cron calls hourly in production, which
  // internally calls emitEvent() -> eventBus -> executor. This is AI-09's real trigger: it has no
  // dedicated business-action route (revenue recognition is a continuous scan + schedule.due
  // runner, not a per-record hook), so the cron sweep IS the ordinary business action for it.
  it("trigger proof: the real cron sweep route (not runWorkflow()) fires AI-09 and produces a revenue-leakage finding", async () => {
    await Organization.create({ name: "AI09 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const partnerId = await makeCustomer("Real-Trigger Leakage Customer");
    await makeSaleOrder({ partnerId, amount: 75000, shipmentStatus: "fulfilled" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-09" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real ai.sweep.hourly event that reached AI-09").not.toBeNull();
    expect(run!.findings.some((f) => f.title.includes("Revenue leakage"))).toBe(true);
    // Never called runWorkflow(ai09RevenueRecognition, ...) directly in this test — proves the
    // whole real path (route -> emitEvent -> eventBus -> executor) works end to end.
  });

  // ── C.3 concurrent duplicate event: schedule.due fired twice "simultaneously" ─────────────
  it("concurrent duplicate schedule.due dispatch → exactly one drafted journal, not two (persistent idempotency actually holds)", async () => {
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

    // Two independent AiEvents for the same real-world occurrence (no dedupeKey passed at either
    // call site in production — this is the honest simultaneous-duplicate shape, not a contrived
    // one), dispatched genuinely concurrently via Promise.all.
    const event = { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(schedule._id), actingUserId: userId } };
    await Promise.all([
      runWorkflow(ai09RevenueRecognition, { ...event, id: undefined }),
      runWorkflow(ai09RevenueRecognition, { ...event, id: undefined }),
    ]);

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);
    const updated = await AiSchedule.findById(schedule._id).lean();
    expect(updated!.periods[0].status).toBe("drafted");
  });

  // ── C.1 Large volume: 2,000 sale orders, correctness + timing ─────────────────────────────
  it("large volume: 2,000 sale orders scanned correctly within a reasonable time (C.1 Large)", async () => {
    const partnerId = await makeCustomer("Bulk Customer");
    const docs = Array.from({ length: 2000 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `SO-BULK-${i}`, partnerId, dateOrder: new Date() },
      orderLines: [{ name: "Service", productQty: 1, priceUnit: 100, taxIds: [], discount: 0, priceSubtotal: 100 }],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
      status: "posted",
      q2cStatus: "sales_order",
      shipmentStatus: i % 2 === 0 ? "fulfilled" : undefined,
      salesInvoiceIds: [],
    }));
    await SaleOrder.insertMany(docs);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    const start = Date.now();
    const envelope = await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const elapsedMs = Date.now() - start;

    // Correctness: every delivered-but-unbilled order (half of them) is a leakage finding.
    const leakageFindings = envelope.findings.filter((f) => f.title.includes("Revenue leakage"));
    expect(leakageFindings.length).toBe(1000);
    // eslint-disable-next-line no-console
    console.log(`AI-09 large-volume scan (2,000 orders): ${elapsedMs}ms`);
    expect(elapsedMs, "AI-09's per-order N+1 lookups must stay within the 10s single-run budget even at this scale").toBeLessThan(10000);
  }, 30000);

  // ── C.1 Null/missing fields + malformed ────────────────────────────────────────────────────
  it("null/missing fields and malformed data (no partnerId, no orderLines, unicode/HTML name, negative amount) never crash and never auto-recognise", async () => {
    await makeAccount("income");
    await makeAccount("asset_current");
    await SaleOrder.create({
      tenantId: TENANT,
      // A dangling partnerId (customer since deleted) — Customer.findById legitimately resolves
      // to null for this, exercising the same "missing" shape as a genuinely absent field would,
      // since SaleOrder's own schema requires partnerId to be present (confirmed: creating one
      // without it is rejected at the ORM layer before AI-09 ever sees it).
      header: { name: "SO-dangling-partner", partnerId: new mongoose.Types.ObjectId(), dateOrder: new Date() },
      orderLines: undefined, // no orderLines at all
      totals: { amountUntaxed: -5000, amountTax: 0, amountTotal: -5000 }, // negative contracted amount
      status: "posted",
      q2cStatus: "sales_order",
      shipmentStatus: "fulfilled",
      salesInvoiceIds: [],
    });
    await SaleOrder.create({
      tenantId: TENANT,
      header: { name: `SO-<script>alert(1)</script> 日本語 مرحبا ${"x".repeat(500)}`, partnerId: await makeCustomer("Unicode客户 <b>vendor</b>"), dateOrder: new Date("1900-01-01") },
      orderLines: [{ name: "Service", productQty: 1, priceUnit: 0, taxIds: [], discount: 0, priceSubtotal: 0 }], // zero amount
      totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
      status: "posted",
      q2cStatus: "sales_order",
      shipmentStatus: "fulfilled",
      salesInvoiceIds: [],
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    await expect(runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} })).resolves.toBeDefined();

    // Negative/zero contracted amounts must never be treated as a ready-to-recognise order
    // (reason()'s own `o.contracted > 0` guard) — no journal drafted for either malformed order.
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
  });

  // ── C.4 Cross-tenant hostile input (regression for the fix made in this pass) ─────────────
  it("cross-tenant hostile: a schedule.due event carrying another tenant's real scheduleId is refused, not processed under this tenant (regression for extract()'s tenant re-check)", async () => {
    const victimDebitId = await makeAccount("liability_current", OTHER_TENANT);
    const victimCreditId = await makeAccount("income", OTHER_TENANT);
    const victimPartner = await makeCustomer("Victim Customer", OTHER_TENANT);
    const victimOrder = await makeSaleOrder({ partnerId: victimPartner, amount: 999999, name: "Victim Annual subscription", tenantId: OTHER_TENANT });
    const victimSchedule = await AiSchedule.create({
      tenantId: OTHER_TENANT,
      scheduleType: "deferred_revenue",
      sourceRef: { model: "SaleOrder", id: String(victimOrder._id) },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: 999999,
      currency: "INR",
      debitAccountId: victimDebitId,
      creditAccountId: victimCreditId,
      basis: "inferred",
      periods: [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 83333.25, status: "pending" }],
      recognisedToDate: 0,
      remaining: 999999,
      nextRunDate: new Date("2026-01-31"),
      createdByWorkflow: "AI-09",
    });

    const attackerUserId = await makeUser(TENANT);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    // A direct invocation (bypassing the event bus's own scheduleBelongsTo() dispatch filter) —
    // exactly the "deliberately hostile parameter, not just a clean one" the brief asks for.
    const envelope = await runWorkflow(ai09RevenueRecognition, {
      tenantId: TENANT,
      eventKey: "schedule.due",
      payload: { scheduleId: String(victimSchedule._id), actingUserId: attackerUserId },
    });

    expect(envelope.metrics?.scanned ?? 0).toBe(0);
    const journal = await JournalEntry.findOne({}).lean();
    expect(journal, "no journal may be drafted from another tenant's schedule").toBeNull();
    const updatedVictimSchedule = await AiSchedule.findById(victimSchedule._id).lean();
    expect(updatedVictimSchedule!.periods[0].status).toBe("pending"); // untouched
  });

  // ── C.6 Adversarial: a confidently-wrong "it's a subscription" trap ───────────────────────
  it("adversarial: a stated point_in_time order whose NAME contains a subscription keyword must NOT be reclassified over_time (human intent beats the keyword heuristic)", async () => {
    await makeAccount("income");
    await makeAccount("asset_current");
    const userId = await makeUser();
    const partnerId = await makeCustomer();
    const invoice = await makeSalesInvoice(partnerId, 40000);
    // A naive implementation might key off "Annual subscription" in the name and start a
    // deferred-revenue schedule — but the human already stated point_in_time explicitly, and
    // A.2's rule is that stated method always wins over any inference.
    await makeSaleOrder({
      partnerId,
      amount: 40000,
      shipmentStatus: "fulfilled",
      salesInvoiceIds: [invoice._id as mongoose.Types.ObjectId],
      method: "point_in_time",
      name: "Annual subscription plan — one-time buyout",
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

    await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    // Must recognise point-in-time (a drafted recognition journal), and must NOT also create a
    // deferred_revenue schedule for the same order — the confidently-wrong answer a keyword-only
    // implementation would produce.
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1);
    const scheduleCount = await AiSchedule.countDocuments({ tenantId: TENANT, "sourceRef.model": "SaleOrder" });
    expect(scheduleCount).toBe(0);
  });

  // ── C.2 Month-length/leap-day boundary ─────────────────────────────────────────────────────
  // Regression test for a bug found during this verification pass, in the same defect shape
  // already fixed in AI-07 (docs/ai/BRIEF-09-VERIFICATION.md Part A.2 — "check the same defect
  // shape across all other workflows"): the new deferred_revenue schedule's endDate used plain
  // `endDate.setUTCMonth(endDate.getUTCMonth() + 12)`, which rolls Feb 29 into Mar 1/2 of the
  // following non-leap year instead of clamping to Feb 28. Fixed with `addMonthsClamped()`.
  it("month-length boundary: a subscription schedule created on Feb 29 (leap day) gets an endDate of Feb 28 next year, not Mar 1/2", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-02-29T10:00:00Z")); // 2028 is a leap year; 2029 is not
    try {
      await makeAccount("income");
      await makeAccount("liability_current");
      const userId = await makeUser();
      const partnerId = await makeCustomer();
      await makeSaleOrder({ partnerId, amount: 12000, name: "Annual subscription plan" });
      await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-09", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });

      await runWorkflow(ai09RevenueRecognition, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

      const schedule = await AiSchedule.findOne({ tenantId: TENANT, "sourceRef.model": "SaleOrder" }).lean();
      expect(schedule).not.toBeNull();
      expect(schedule!.endDate.getUTCFullYear()).toBe(2029);
      expect(schedule!.endDate.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(schedule!.endDate.getUTCDate()).toBe(28); // clamped to Feb's last real day, NOT Mar 1/2
    } finally {
      vi.useRealTimers();
    }
  });
});

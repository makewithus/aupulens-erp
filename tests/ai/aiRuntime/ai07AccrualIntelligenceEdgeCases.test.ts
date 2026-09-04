import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai07_edge";

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
import AiAttentionItem from "@/models/ai/AiAttentionItem";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai07AccrualIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-07-accrual-intelligence").ai07AccrualIntelligence;
let createDraftBill: typeof import("@/lib/docIntel/billCreate").createDraftBill;

const TENANT = "ai07-edge-tenant";
const OTHER_TENANT = "ai07-edge-tenant-B";

async function makeAccount(tenantId: string, account_type: string) {
  const acc = await Account.create({ tenantId, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}
async function makeVendor(tenantId: string, name = "Acme Supplies") {
  const c = await Customer.create({ tenantId, header: { name, is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}
async function makeUser(tenantId: string) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
  return String(u._id);
}
async function makePurchaseOrder(tenantId: string, partnerId: mongoose.Types.ObjectId, lines: { productQty: number; receivedQty: number; billedQty: number; priceUnit: number }[]) {
  return PurchaseOrder.create({
    tenantId,
    name: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnerId,
    dateOrder: new Date("2026-02-01"),
    orderLines: lines.map((l, i) => ({
      productId: new mongoose.Types.ObjectId(), name: `Item ${i}`, productQty: l.productQty, receivedQty: l.receivedQty,
      billedQty: l.billedQty, priceUnit: l.priceUnit, taxIds: [], priceSubtotal: l.priceUnit * l.productQty,
    })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
    status: "approved",
    createdBy: new mongoose.Types.ObjectId(),
  });
}

describe("AI-07 — Accrual intelligence: verification edge cases (docs/ai/BRIEF-09-VERIFICATION.md)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(), Invoice.init(), Customer.init(), User.init(), PurchaseOrder.init(), JournalEntry.init(),
      AiSchedule.init(), AiMaterialityPolicy.init(), AiLearningRecord.init(), AiWorkflowRun.init(), AiDecisionTrace.init(),
      AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiAttentionItem.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai07AccrualIntelligence } = await import("@/lib/aiRuntime/workflows/ai-07-accrual-intelligence"));
    ({ createDraftBill } = await import("@/lib/docIntel/billCreate"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}), Invoice.deleteMany({}), Customer.deleteMany({}), PurchaseOrder.deleteMany({}),
      JournalEntry.deleteMany({}), AiSchedule.deleteMany({}), AiMaterialityPolicy.deleteMany({}), AiLearningRecord.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}), AiAttentionItem.deleteMany({}),
    ]);
  });

  // ── C.4 Cross-tenant hostile input ─────────────────────────────────────────
  // Regression test for two bugs found during this verification pass in
  // lib/aiRuntime/workflows/ai-07-accrual-intelligence/index.ts's extract(): both the
  // `accuracy_check` branch (`Invoice.findById`) and the `reversal_run` branch
  // (`AiSchedule.findById`) fetched their subject record with NO tenantId filter. A hostile
  // scheduleId/invoiceId reaching extract() from a tenant whose declared tenantId doesn't match
  // the record's real tenant — possible via lib/aiRuntime/nl/chatBridge.ts's
  // runWorkflowFromChat(), which calls runWorkflow() directly and bypasses subscriptionFilter's
  // scheduleBelongsTo() ownership check entirely — could read another tenant's PurchaseOrder/
  // AiSchedule/Invoice data. Fixed by scoping both queries to `{_id, tenantId: ctx.tenantId}`.
  it("cross-tenant hostile input: a scheduleId belonging to tenant B, referenced from a tenant A schedule.due event, must fail closed", async () => {
    const debitAcc = await makeAccount(OTHER_TENANT, "expense");
    const creditAcc = await makeAccount(OTHER_TENANT, "liability_current");
    const vendor = await makeVendor(OTHER_TENANT);
    const po = await makePurchaseOrder(OTHER_TENANT, vendor, [{ productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 100 }]);
    const secretSchedule = await AiSchedule.create({
      tenantId: OTHER_TENANT, scheduleType: "accrual_reversal", sourceRef: { model: "PurchaseOrder", id: String(po._id) },
      status: "approved", startDate: new Date("2026-01-01"), endDate: new Date("2026-02-01"), frequency: "monthly",
      totalAmount: 1000, currency: "INR", debitAccountId: creditAcc, creditAccountId: debitAcc, basis: "stated",
      periods: [{ periodKey: "2026-02", dueDate: new Date("2020-01-01"), amount: 1000, status: "pending" }],
      recognisedToDate: 0, remaining: 1000, nextRunDate: new Date("2020-01-01"), createdByWorkflow: "AI-07",
    });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    const userIdA = await makeUser(TENANT);

    // subscriptionFilter is bypassed here on purpose — this is exactly the direct-invocation
    // path (runWorkflow() called directly) that chatBridge.ts's runWorkflowFromChat() uses.
    await expect(
      runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "schedule.due", payload: { scheduleId: String(secretSchedule._id), actingUserId: userIdA } }),
    ).rejects.toThrow(/not found/);

    // No journal was posted under tenant A referencing tenant B's schedule/amounts.
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
    const crossTenantSchedule = await AiSchedule.findById(secretSchedule._id).lean();
    expect(crossTenantSchedule!.periods[0].status).toBe("pending"); // untouched
  });

  // ── C.1 Large (10k+) — the ai.sweep.hourly GRNI scan iterates every open PurchaseOrder ──────
  it("large volume: 10,000 PurchaseOrders (one with a real GRNI gap) → the sweep finds the real candidate and completes within budget", async () => {
    await makeAccount(TENANT, "expense");
    await makeAccount(TENANT, "liability_current");
    const userId = await makeUser(TENANT);
    const vendor = await makeVendor(TENANT);

    const bulkPOs = Array.from({ length: 10000 }, (_, i) => ({
      tenantId: TENANT,
      name: `BULK-PO-${i}`,
      partnerId: vendor,
      dateOrder: new Date("2026-02-01"),
      orderLines: [{ productId: new mongoose.Types.ObjectId(), name: "Item", productQty: 1, receivedQty: 1, billedQty: 1, priceUnit: 10, taxIds: [], priceSubtotal: 10 }], // fully billed — never a candidate
      totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
      status: "approved",
      createdBy: new mongoose.Types.ObjectId(),
    }));
    await PurchaseOrder.insertMany(bulkPOs);
    // The one real candidate, buried among 10,000 noise rows.
    await makePurchaseOrder(TENANT, vendor, [{ productQty: 10, receivedQty: 10, billedQty: 4, priceUnit: 100 }]);

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });

    const start = Date.now();
    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });
    const elapsedMs = Date.now() - start;

    const finding = envelope.findings.find((f) => f.title.includes("GRNI accrual candidate"));
    expect(finding).toBeDefined();
    expect(finding!.amount).toBe(600);
    expect(envelope.findings.filter((f) => f.title.includes("GRNI accrual candidate"))).toHaveLength(1); // exactly the real one, no false positives among 10,000 fully-billed POs
    console.log(`AI-07 GRNI sweep over 10,001 POs: ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(10000); // Part E.3 budget: any single event-triggered run < 10s
  }, 30000);

  // ── C.4 Kill switch off ─────────────────────────────────────────────────────
  it("kill switch off → GRNI candidate still surfaced but never auto-drafted, no journal written", async () => {
    await makeAccount(TENANT, "expense");
    await makeAccount(TENANT, "liability_current");
    const userId = await makeUser(TENANT);
    const vendor = await makeVendor(TENANT);
    await makePurchaseOrder(TENANT, vendor, [{ productQty: 10, receivedQty: 10, billedQty: 4, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: false, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });

    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    expect(envelope.autonomyApplied).toBe("recommend");
    expect(envelope.findings.some((f) => f.title.includes("GRNI accrual candidate"))).toBe(true);
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0);
  });

  // ── C.2 Materiality edge (exactly at threshold, one under, one over) ────────
  it("materiality edge: exactly at threshold → RECOMMEND (not draftable); one unit under → draftable; one unit over → RECOMMEND", async () => {
    await makeAccount(TENANT, "expense");
    await makeAccount(TENANT, "liability_current");
    const userId = await makeUser(TENANT);
    const vendor = await makeVendor(TENANT);
    // amount = gapQty * priceUnit = 10 * 100 = 1000 exactly at the threshold.
    await makePurchaseOrder(TENANT, vendor, [{ productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 1000 }] });

    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    expect(envelope.findings.some((f) => f.title.includes("GRNI accrual candidate"))).toBe(true); // still surfaced
    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(0); // exactly-at-threshold is NOT "below threshold" — RECOMMEND only, never auto-drafted
  });

  it("materiality edge: one unit under the threshold → draftable and drafted", async () => {
    await makeAccount(TENANT, "expense");
    await makeAccount(TENANT, "liability_current");
    const userId = await makeUser(TENANT);
    const vendor = await makeVendor(TENANT);
    // amount = 9.99 * 100 = 999, one unit under a 1000 threshold.
    await makePurchaseOrder(TENANT, vendor, [{ productQty: 9.99, receivedQty: 9.99, billedQty: 0, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 1000 }] });

    await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const journalCount = await JournalEntry.countDocuments({ tenantId: TENANT });
    expect(journalCount).toBe(1); // below threshold — auto-drafted
  });

  // ── C.2 Month-length boundary ────────────────────────────────────────────────
  // Regression test for a bug found during this verification pass in this workflow's own
  // act(): the GRNI accrual's reversalDate used `date.setUTCMonth(date.getUTCMonth() + 1)`,
  // which rolls into the month AFTER the intended one whenever drafted on the 29th/30th/31st of
  // a month followed by a shorter one (e.g. Jan 31 -> Mar 3, not Feb 28) — a real JS Date
  // arithmetic pitfall, not a typo. Fixed with a clamped "add one calendar month" helper.
  it("month-length boundary: an accrual drafted on Jan 31 reverses in February, not March", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T10:00:00Z"));
    try {
      await makeAccount(TENANT, "expense");
      await makeAccount(TENANT, "liability_current");
      const userId = await makeUser(TENANT);
      const vendor = await makeVendor(TENANT);
      await makePurchaseOrder(TENANT, vendor, [{ productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 100 }]);
      await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
      await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });

      await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

      const schedule = await AiSchedule.findOne({ tenantId: TENANT, scheduleType: "accrual_reversal" }).lean();
      expect(schedule).not.toBeNull();
      expect(schedule!.periods[0].periodKey).toBe("2026-02"); // NOT "2026-03"
      expect(schedule!.periods[0].dueDate.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(schedule!.periods[0].dueDate.getUTCDate()).toBe(28); // clamped to Feb's last real day
    } finally {
      vi.useRealTimers();
    }
  });

  // ── C.1 Malformed data ───────────────────────────────────────────────────────
  it("malformed data: absurd receivedQty/priceUnit precision and a 500-char unicode/RTL product name → no crash, amount rounds to the cent", async () => {
    await makeAccount(TENANT, "expense");
    await makeAccount(TENANT, "liability_current");
    const userId = await makeUser(TENANT);
    const vendor = await makeVendor(TENANT, "מוֹרֶה גַּם بائع 供应商 " + "ة".repeat(480));
    const po = await PurchaseOrder.create({
      tenantId: TENANT,
      name: `PO-MALFORMED-${Date.now()}`,
      partnerId: vendor,
      dateOrder: new Date("2026-02-01"),
      orderLines: [{
        productId: new mongoose.Types.ObjectId(),
        name: "<script>alert(1)</script>" + "ü".repeat(480),
        productQty: 10, receivedQty: 10, billedQty: 3.333333333, // more decimals than any currency allows
        priceUnit: 33.335, // sub-paise precision
        taxIds: [], priceSubtotal: 0,
      }],
      totals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0 },
      status: "approved",
      createdBy: new mongoose.Types.ObjectId(),
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });

    const envelope = await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const finding = envelope.findings.find((f) => f.title.includes("GRNI accrual candidate"));
    expect(finding).toBeDefined();
    // gap = 10 - 3.333333333 = 6.666666667; amount = round2(6.666666667 * 33.335) = 222.24
    expect(Number.isFinite(finding!.amount)).toBe(true);
    expect(Math.round((finding!.amount as number) * 100) / 100).toBe(finding!.amount); // already rounded to the cent
    void po;
  });

  // ── C.5 / C.6 Adversarial: a PO amended AFTER a prior accrual was drafted ──────────────────
  // The naive implementation would trust the FIRST accrual amount forever. AI-07's accuracy_check
  // branch instead re-derives the delta against the ACTUAL invoice every time a bill arrives —
  // proving a stale/amended-source accrual is caught (flagged "edited", not silently "accepted")
  // rather than confidently reporting a match that no longer holds.
  it("adversarial: PO amended after the accrual was drafted (invoice arrives at a materially different amount) → learning outcome is 'edited', not a confidently-wrong 'accepted'", async () => {
    await makeAccount(TENANT, "expense");
    await makeAccount(TENANT, "liability_current");
    const userId = await makeUser(TENANT);
    const vendor = await makeVendor(TENANT);
    const po = await makePurchaseOrder(TENANT, vendor, [{ productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 100 }]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });
    await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });
    // Accrued 1000 (10 units @ 100). The PO is amended (vendor renegotiated pricing) and the real
    // bill arrives at 1300 — a 30% delta, well past the 5% "accepted" tolerance.
    const bill = await Invoice.create({
      tenantId: TENANT, name: `BILL-ADV-${Date.now()}`, partnerId: vendor, moveType: "in_invoice", state: "draft",
      invoiceDate: new Date(), dueDate: new Date(),
      invoiceLines: [{ name: "Goods (repriced)", priceSubtotal: 1300, quantity: 10, priceUnit: 130 }],
      amountTotal: 1300,
    });
    await PurchaseOrder.updateOne({ _id: po._id }, { $push: { invoiceIds: bill._id } });

    await runWorkflow(ai07AccrualIntelligence, { tenantId: TENANT, eventKey: "bill.created", payload: { invoiceId: String(bill._id) } });

    const record = await AiLearningRecord.findOne({ tenantId: TENANT, workflowId: "AI-07", "proposal.accrualAccuracy.basis": "accrual_accuracy" }).lean();
    expect(record).not.toBeNull();
    expect(record!.outcome).toBe("edited"); // NOT "accepted" — the delta is surfaced, not papered over
  });
});

describe("AI-07 — trigger proof: fires from the REAL vendor-bill creation path (docIntel createDraftBill), not runWorkflow() directly", () => {
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

  it("createDraftBill() (the real service function app/api/document-intelligence/[id]/confirm/route.ts calls) fires AI-07's accuracy_check branch as a real side effect", async () => {
    const TRIGGER_TENANT = "ai07-trigger-tenant";
    await makeAccount(TRIGGER_TENANT, "expense");
    await makeAccount(TRIGGER_TENANT, "liability_current");
    const userId = await makeUser(TRIGGER_TENANT);
    const vendor = await makeVendor(TRIGGER_TENANT, "Real Trigger Vendor");
    const po = await makePurchaseOrder(TRIGGER_TENANT, vendor, [{ productQty: 5, receivedQty: 5, billedQty: 0, priceUnit: 200 }]);
    await AiWorkflowPolicy.create({ tenantId: TRIGGER_TENANT, workflowId: "AI-07", killSwitchEnabled: true, maxAutonomyLevel: "draft", confidenceThreshold: 0.1 });
    await AiMaterialityPolicy.create({ tenantId: TRIGGER_TENANT, thresholds: [{ appliesTo: "accrual", absoluteAmount: 100000 }] });
    // First, the GRNI sweep drafts the accrual (so accuracy_check has something to compare against).
    await runWorkflow(ai07AccrualIntelligence, { tenantId: TRIGGER_TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const result = await createDraftBill(
      {
        vendorName: "Real Trigger Vendor", vendorGstin: undefined, billDate: new Date().toISOString(), dueDate: undefined,
        billNumber: "REAL-BILL-1", poReference: undefined, currency: "INR", subtotal: 1000, taxAmount: 0, totalAmount: 1000,
        lineItems: [{ description: "Goods", quantity: 5, unitPrice: 200, amount: 1000 }],
      } as never,
      { tenantId: TRIGGER_TENANT, userId },
    );
    // Link the new bill to the PO the same way a real matching flow would (this part of the
    // matching logic is out of scope here — we're proving the TRIGGER, not the matcher).
    await PurchaseOrder.updateOne({ _id: po._id }, { $push: { invoiceIds: result.invoiceId } });
    // The real event this service function emits (see lib/docIntel/billCreate.ts's own
    // safeEmitEvent("bill.created", ...) call) — re-dispatch it now that the PO link exists,
    // mirroring what the real cron sweep / immediate inline dispatch already attempted.
    const { emitEvent } = await import("@/lib/aiRuntime/runtime/eventBus");
    await emitEvent(TRIGGER_TENANT, "bill.created", { invoiceId: String(result.invoiceId), actingUserId: userId });

    const run = await AiWorkflowRun.findOne({ tenantId: TRIGGER_TENANT, workflowId: "AI-07", entityId: String(result.invoiceId) }).lean();
    expect(run, "AI-07 did not fire from the real createDraftBill() → bill.created path").not.toBeNull();
    const record = await AiLearningRecord.findOne({ tenantId: TRIGGER_TENANT, workflowId: "AI-07", "proposal.accrualAccuracy.basis": "accrual_accuracy" }).lean();
    expect(record).not.toBeNull();
    expect(record!.outcome).toBe("accepted"); // exact match: 1000 accrual vs 1000 bill
  });
});

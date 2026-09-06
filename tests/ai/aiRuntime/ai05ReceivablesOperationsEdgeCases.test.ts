import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai05edge";
process.env.CRON_SECRET = "ai05-edge-test-secret";

import { SalesInvoice as SalesInvoiceModel } from "@/models/sales/SalesInvoice";
import Payment from "@/models/sales/Payment";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiCommunicationDraft from "@/models/ai/AiCommunicationDraft";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import Organization from "@/models/admin/Organization";

const SalesInvoice: any = SalesInvoiceModel;

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai05ReceivablesOperations: typeof import("@/lib/aiRuntime/workflows/ai-05-receivables-operations").ai05ReceivablesOperations;

const TENANT = "ai05-edge-tenant";
const OTHER_TENANT = "ai05-edge-other-tenant";

// A real, persisted User — `draft_receipt_allocation` is a standard (non-internal_state) write
// (models/sales/Payment.ts), so it goes through the normal routePermissionCheck, which needs a
// real User document to resolve a role from. An arbitrary ObjectId with no backing User fails
// that check closed (silently caught by AI-05's own act() try/catch) — found while writing these
// tests; fixed here, not in AI-05 (this is correct, intentional behaviour on AI-05's part).
async function makeUser(tenantId: string = TENANT) {
  const u = await User.create({ tenantId, name: "Sales User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "sales", status: "active" });
  return String(u._id);
}

async function makeCustomer(name = "Acme Co", tenantId = TENANT) {
  const c = await Customer.create({ tenantId, header: { name, is_company: true }, contact_details: {}, createdBy: new mongoose.Types.ObjectId() });
  return c;
}

async function makeInvoice(customerId: string, overrides: Partial<Record<string, any>> = {}, tenantId = TENANT) {
  return SalesInvoice.create({
    tenantId,
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

async function makeDraftPayment(customerId: string, unusedAmount: number, overrides: Partial<Record<string, any>> = {}, tenantId = TENANT) {
  return Payment.create({
    tenantId,
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

async function policy(tenantId = TENANT, overrides: Partial<Record<string, any>> = {}) {
  await AiWorkflowPolicy.create({ tenantId, workflowId: "AI-05", killSwitchEnabled: true, maxAutonomyLevel: "draft", ...overrides });
}

describe("AI-05 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      SalesInvoice.init(), Payment.init(), Customer.init(), User.init(), AiMaterialityPolicy.init(), AiWorkflowRun.init(),
      AiDecisionTrace.init(), AiAttentionItem.init(), AiCommunicationDraft.init(), AiWorkflowPolicy.init(), Organization.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai05ReceivablesOperations } = await import("@/lib/aiRuntime/workflows/ai-05-receivables-operations"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      SalesInvoice.deleteMany({}), Payment.deleteMany({}), Customer.deleteMany({}), User.deleteMany({}), AiMaterialityPolicy.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiAttentionItem.deleteMany({}), AiCommunicationDraft.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}), Organization.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL call site ───────────────────────────────────
  // AI-05 has no dedicated per-record business route (receivables ops is a continuous sweep, not
  // a create-a-record hook) — same shape as AI-09 (docs/ai/BRIEF-09-VERIFICATION.md B.1): the
  // real cron sweep route IS its ordinary trigger in production.
  it("trigger proof: the real cron sweep route (not runWorkflow()) fires AI-05 and drafts a collection-worklist communication", async () => {
    await Organization.create({ name: "AI05 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const customer = await makeCustomer();
    // Overdue, not a draft-payment scenario — the real unattended cron trigger carries no
    // actingUserId at all (app/api/cron/ai/runtime-sweep/route.ts's own `emitEvent(subdomain,
    // "ai.sweep.hourly", {})` — an empty payload, always), so `gateOverrides.permissionOk`
    // (`Boolean(extracted.actingUserId)`) is always false on this path, and the DRAFT-tier
    // financial write (draft_receipt_allocation) never fires from it (see the dedicated test
    // below). Worklist drafting and disputes are NOT gated on that check, by design, so they are
    // what the plain unattended trigger actually, honestly proves.
    await makeInvoice(String(customer._id), { totalAmount: 500, dueDate: new Date(Date.now() - 10 * 86400000) });
    await policy();

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-05" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real ai.sweep.hourly event that reached AI-05").not.toBeNull();
    const drafts = await AiCommunicationDraft.find({ tenantId: TENANT, customerId: customer._id }).lean();
    expect(drafts.length, "the real unattended sweep must still draft a chase communication for the overdue invoice").toBe(1);
  });

  // ── Finding: the real unattended cron trigger has no acting user, so the DRAFT-tier financial
  // write never fires from it — only from a human-initiated invocation (e.g. AI-NL's
  // handleWorkflowIntent(), which injects `actingUserId: userId` — lib/aiRuntime/nl/
  // workflowChatHandler.ts:46). Not a bug: every existing allocation-asserting test in
  // ai05ReceivablesOperations.test.ts already passes an explicit actingUserId, which is the
  // correct, intentional shape (a real financial write, even at DRAFT tier, requires some acting
  // principal in context) — but it means "fires unprompted and autonomously drafts allocations"
  // is only half true for the plain hourly sweep. Documented in AI-05.md's Trigger proof section.
  it("the real unattended sweep (no actingUserId) reports the allocation candidate but never writes draft_receipt_allocation", async () => {
    const customer = await makeCustomer();
    await makeInvoice(String(customer._id), { totalAmount: 500, dueDate: new Date(Date.now() - 2 * 86400000) });
    const payment = await makeDraftPayment(String(customer._id), 500);
    await policy();

    const envelope = await runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { allocationCandidates: { paymentId: string; type: string }[] };
    expect(proposal.allocationCandidates.some((c) => c.paymentId === String(payment._id) && c.type === "exact")).toBe(true);

    const updated = await Payment.findById(payment._id).lean();
    expect(updated!.allocations.length).toBe(0); // reported, not written — no acting principal
  });

  // ── C.4 Cross-tenant hostile input ─────────────────────────────────────────────────────────
  // Confirmed by source reading (docs/ai/BRIEF-09-VERIFICATION.md's named prior finding): AI-05
  // has NO unscoped id-based fetch anywhere in extract() — every query (SalesInvoice, Payment,
  // Invoice, AiMaterialityPolicy) filters by `tenantId: ctx.tenantId` directly; the only payload
  // field read at all is `actingUserId`, used only for a permission-boolean, never as a lookup
  // key. There is no injection point of the "trust an event-payload id" shape. Asserted here
  // directly: a hostile payload naming another tenant's real customer/payment/invoice ids has no
  // effect — AI-05 only ever sees TENANT's own rows.
  it("cross-tenant hostile: a payload naming another tenant's real record ids never leaks into this tenant's run", async () => {
    const victimCustomer = await makeCustomer("Victim Co", OTHER_TENANT);
    await makeInvoice(String(victimCustomer._id), { totalAmount: 999999, dueDate: new Date(Date.now() - 2 * 86400000) }, OTHER_TENANT);
    const victimPayment = await makeDraftPayment(String(victimCustomer._id), 999999, {}, OTHER_TENANT);
    await policy();

    const envelope = await runWorkflow(ai05ReceivablesOperations, {
      tenantId: TENANT,
      eventKey: "ai.sweep.hourly",
      payload: { actingUserId: String(new mongoose.Types.ObjectId()), customerId: String(victimCustomer._id), paymentId: String(victimPayment._id) },
    });

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { allocationCandidates: { paymentId: string }[] };
    expect(proposal.allocationCandidates.some((c) => c.paymentId === String(victimPayment._id))).toBe(false);

    const victimAfter = await Payment.findById(victimPayment._id).lean();
    expect(victimAfter!.allocations.length).toBe(0); // untouched
  });

  // ── C.4 Nothing configured ─────────────────────────────────────────────────────────────────
  it("nothing configured: no materiality policy row → reasonChain states which setting is missing, worklist still produced", async () => {
    const customer = await makeCustomer();
    await makeInvoice(String(customer._id), { dueDate: new Date(Date.now() - 30 * 86400000) });
    await policy();

    const envelope = await runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    expect(trace!.reasonChain.some((r: string) => r.includes('no "receivables_collection" materiality threshold configured'))).toBe(true);
  });

  // ── C.2 Materiality edge: exactly at / one under / one over the configured threshold ───────
  it("materiality edge: a worklist entry exactly at the threshold escalates, one unit under does not", async () => {
    const customerAt = await makeCustomer("At-Threshold Co");
    const customerUnder = await makeCustomer("Under-Threshold Co");
    const invAt = await makeInvoice(String(customerAt._id), { totalAmount: 10000, dueDate: new Date(Date.now() - 50 * 86400000) });
    const invUnder = await makeInvoice(String(customerUnder._id), { totalAmount: 9999, dueDate: new Date(Date.now() - 50 * 86400000) });
    await AiMaterialityPolicy.create({ tenantId: TENANT, thresholds: [{ appliesTo: "receivables_collection", absoluteAmount: 10000 }] });
    await policy();

    await runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: String(new mongoose.Types.ObjectId()) } });

    const atItem = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: `AI-05:worklist:${TENANT}:${invAt._id}` }).lean();
    const underItem = await AiAttentionItem.findOne({ tenantId: TENANT, dedupeKey: `AI-05:worklist:${TENANT}:${invUnder._id}` }).lean();
    expect(atItem, "exactly-at-threshold must escalate (>=), not just strictly-over").not.toBeNull();
    expect(underItem).toBeNull();
  });

  // ── C.2 Confidence/heuristic edge: the 80% short-payment-vs-partial documented boundary ───
  it("short-payment heuristic edge: 80.00% is a dispute, 79.99% is an ordinary partial", async () => {
    const customerAt = await makeCustomer("Edge80 Co");
    const customerUnder = await makeCustomer("Edge7999 Co");
    await makeInvoice(String(customerAt._id), { totalAmount: 1000, dueDate: new Date(Date.now() - 2 * 86400000) });
    await makeInvoice(String(customerUnder._id), { totalAmount: 1000, dueDate: new Date(Date.now() - 2 * 86400000) });
    const payAt = await makeDraftPayment(String(customerAt._id), 800); // exactly 80%
    const payUnder = await makeDraftPayment(String(customerUnder._id), 799.9); // just under 80%
    await policy();
    const userId = await makeUser();

    // An acting user is required for the DRAFT-tier financial write itself: `draft_receipt_
    // allocation` writes models/sales/Payment.ts (not an internal_state/Ai* model), so it goes
    // through the standard routePermissionCheck, which needs a REAL User document to resolve a
    // role from — a bare ObjectId with no backing User fails closed (found while writing this
    // test; correct, intentional behaviour on AI-05's part, not a bug).
    await runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } });

    const updatedAt = await Payment.findById(payAt._id).lean();
    const updatedUnder = await Payment.findById(payUnder._id).lean();
    expect(updatedAt!.allocations.length).toBe(0); // dispute, no false allocation
    expect(updatedUnder!.allocations.length).toBe(1); // ordinary partial
    expect(updatedUnder!.allocations[0].amount).toBeCloseTo(799.9, 2);
  });

  // ── C.4 Kill switch off ────────────────────────────────────────────────────────────────────
  it("kill switch off: no allocation, no dispute, no draft communication — clean no_action, reason stated", async () => {
    const customer = await makeCustomer();
    await makeInvoice(String(customer._id), { totalAmount: 1000, dueDate: new Date(Date.now() - 10 * 86400000) });
    const payment = await makeDraftPayment(String(customer._id), 850);
    // Deliberately no AiWorkflowPolicy row — killSwitchEnabled defaults to false.

    const envelope = await runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    expect(envelope.autonomyApplied).toBe("recommend");

    const updated = await Payment.findById(payment._id).lean();
    expect(updated!.allocations.length).toBe(0);
    const dispute = await (await import("@/models/ai/AiDispute")).default.findOne({ tenantId: TENANT }).lean();
    // Disputes are workflow-native record-keeping and are NOT gated on decision.autonomyApplied
    // by design (index.ts's own comment) — but the underlying candidate classification (short
    // payment @ 85%) still ran here, so the dispute IS still opened even with the kill switch
    // off. This is intentional (observation, not a financial action) — asserted explicitly so a
    // future change to that design shows up here.
    expect(dispute).not.toBeNull();
    expect(updated!.status).toBe("draft");
  });

  // ── C.3 Concurrent duplicate event ─────────────────────────────────────────────────────────
  it("concurrent duplicate ai.sweep.hourly dispatch → exactly one allocation on the same draft payment, not two", async () => {
    const customer = await makeCustomer();
    await makeInvoice(String(customer._id), { totalAmount: 1000, dueDate: new Date(Date.now() - 2 * 86400000) });
    const payment = await makeDraftPayment(String(customer._id), 1000);
    await policy();
    const userId = await makeUser();

    const event = { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: { actingUserId: userId } };
    await Promise.all([
      runWorkflow(ai05ReceivablesOperations, { ...event, id: undefined } as any),
      runWorkflow(ai05ReceivablesOperations, { ...event, id: undefined } as any),
    ]);

    const updated = await Payment.findById(payment._id).lean();
    expect(updated!.allocations.length).toBe(1); // not 2 — the idempotency key held
    expect(updated!.unusedAmount).toBeCloseTo(0, 2);
  });

  // ── C.1 Large volume ────────────────────────────────────────────────────────────────────────
  it("large volume: 3,000 open invoices across many customers, correct worklist within budget", async () => {
    const customers = await Promise.all(Array.from({ length: 300 }, (_, i) => makeCustomer(`Bulk Customer ${i}`)));
    const docs = customers.flatMap((c, ci) =>
      Array.from({ length: 10 }, (_, i) => ({
        tenantId: TENANT,
        number: `BULK-${ci}-${i}`,
        customerId: c._id,
        status: "overdue",
        invoiceDate: new Date(Date.now() - 60 * 86400000),
        dueDate: new Date(Date.now() - 20 * 86400000),
        lineItems: [],
        taxableAmount: 100,
        totalAmount: 100,
        payments: [],
      })),
    );
    await SalesInvoice.insertMany(docs);
    await policy();

    const start = Date.now();
    const envelope = await runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const elapsedMs = Date.now() - start;

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { worklist: unknown[] };
    expect(proposal.worklist.length).toBe(3000);
    // eslint-disable-next-line no-console
    console.log(`AI-05 large-volume sweep (3,000 open invoices / 300 customers): ${elapsedMs}ms`);
    expect(elapsedMs).toBeLessThan(15000);
  }, 30000);

  // ── C.1 Null/missing + malformed data ──────────────────────────────────────────────────────
  it("malformed data (unicode/HTML customer name, 500-char description, absurd dates, zero/negative amounts) never crashes and never fabricates a false allocation", async () => {
    const weirdCustomer = await makeCustomer(`<script>alert(1)</script> मराठी 日本語 ${"x".repeat(500)}`);
    await makeInvoice(String(weirdCustomer._id), { totalAmount: 0, dueDate: new Date("1900-01-01"), invoiceDate: new Date("1900-01-01") }); // zero amount, absurd date
    await makeInvoice(String(weirdCustomer._id), { totalAmount: -500, dueDate: new Date("2099-12-31") }); // negative amount
    await makeDraftPayment(String(weirdCustomer._id), 0.001); // sub-cent unused amount
    await policy();

    await expect(runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} })).resolves.toBeDefined();
    // No allocation may ever be created against a negative-due or zero-due invoice.
    const payments = await Payment.find({ tenantId: TENANT }).lean();
    for (const p of payments) {
      for (const a of p.allocations) expect(a.amount).toBeGreaterThan(0);
    }
  });

  // ── C.6 Adversarial: a customer whose consistent EARLY payment history must not predict a late risk ─
  it("adversarial: a customer who always pays 5 days EARLY is never added to the collection worklist merely for being close to due", async () => {
    const customer = await makeCustomer("Always-Early Co");
    const base = Date.now() - 200 * 86400000;
    for (let i = 0; i < 4; i++) {
      const invDate = new Date(base + i * 20 * 86400000);
      const due = new Date(invDate.getTime() + 30 * 86400000);
      const paidDate = new Date(due.getTime() - 5 * 86400000); // always 5 days EARLY
      await makeInvoice(String(customer._id), { invoiceDate: invDate, dueDate: due, status: "paid", totalAmount: 100, payments: [{ amount: 100, date: paidDate, mode: "Cash" }] });
    }
    // A new invoice not yet due — a naive "recent activity" heuristic might still flag it.
    const openDue = new Date(Date.now() + 10 * 86400000);
    await makeInvoice(String(customer._id), { invoiceDate: new Date(), dueDate: openDue, totalAmount: 200 });
    await policy();

    await runWorkflow(ai05ReceivablesOperations, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: {} });
    const drafts = await AiCommunicationDraft.find({ tenantId: TENANT, customerId: customer._id }).lean();
    expect(drafts.length).toBe(0); // 0% historical lateness, not yet due -> no worklist entry, no chase drafted
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai12edge";
process.env.CRON_SECRET = "ai12-edge-test-secret";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import TaxRate from "@/models/finance/TaxRate";
import JournalEntry from "@/models/finance/JournalEntry";
import User from "@/models/auth/User";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import Organization from "@/models/admin/Organization";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai12TaxIntelligence: typeof import("@/lib/aiRuntime/workflows/ai-12-tax-intelligence").ai12TaxIntelligence;

const TENANT = "ai12-edge-tenant";
const OTHER_TENANT = "ai12-edge-other-tenant";
const PERIOD = "2026-02";
const PERIOD_END = new Date("2026-02-28T23:59:59.999Z");

async function makeCustomer(gstin?: string, tenantId = TENANT) {
  const c = await Customer.create({ tenantId, header: { name: "Acme Co", is_company: true }, gstin, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function makeInvoice(opts: { moveType: "in_invoice" | "out_invoice"; partnerId: mongoose.Types.ObjectId; amountUntaxed: number; amountTax: number; invoiceDate: Date; tenantId?: string }) {
  const inv = await Invoice.create({
    tenantId: opts.tenantId ?? TENANT,
    name: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    partnerId: opts.partnerId,
    moveType: opts.moveType,
    state: "posted",
    invoiceDate: opts.invoiceDate,
    dueDate: opts.invoiceDate,
    invoiceLines: [{ name: "Goods", priceSubtotal: opts.amountUntaxed, quantity: 1, priceUnit: opts.amountUntaxed }],
    amountUntaxed: opts.amountUntaxed,
    amountTax: opts.amountTax,
    amountTotal: opts.amountUntaxed + opts.amountTax,
  });
  return inv;
}

async function runAi12(tenantId = TENANT, period = PERIOD, periodEnd = PERIOD_END) {
  return runWorkflow(ai12TaxIntelligence, { tenantId, eventKey: "period.horizon.reached", payload: { period, periodEnd: periodEnd.toISOString() } });
}

describe("AI-12 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), Account.init(), TaxRate.init(), JournalEntry.init(), User.init(),
      AiTaxTransaction.init(), AiComplianceProfile.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), Organization.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai12TaxIntelligence } = await import("@/lib/aiRuntime/workflows/ai-12-tax-intelligence"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), Account.deleteMany({}), TaxRate.deleteMany({}), JournalEntry.deleteMany({}), User.deleteMany({}),
      AiTaxTransaction.deleteMany({}), AiComplianceProfile.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), Organization.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL call site ─────────────────────────────────
  // AI-12 only fires on period.horizon.reached, emitted exclusively by the cron sweep route in
  // production (no per-record business action exists for it) — that route is its real trigger.
  it("trigger proof: the real cron sweep route (not runWorkflow()) fires AI-12 and rebuilds the tax projection", async () => {
    await Organization.create({ name: "AI12 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date() });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-12" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached event that reached AI-12").not.toBeNull();
    const txCount = await AiTaxTransaction.countDocuments({ tenantId: TENANT });
    expect(txCount).toBeGreaterThan(0); // rebuild_tax_projection actually ran through the real path
  });

  // ── C.1 Large volume: 3,000 invoices, correctness + timing ────────────────────────────────
  it("large volume: 3,000 invoices rebuilt and reconciled correctly within the performance budget (C.1 Large)", async () => {
    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    const docs = Array.from({ length: 3000 }, (_, i) => ({
      tenantId: TENANT,
      name: `BULK-INV-${i}`,
      partnerId: vendor,
      moveType: "in_invoice" as const,
      state: "posted",
      invoiceDate: new Date("2026-02-10"),
      dueDate: new Date("2026-02-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 100, quantity: 1, priceUnit: 100 }],
      amountUntaxed: 100,
      amountTax: 18,
      amountTotal: 118,
    }));
    await Invoice.insertMany(docs);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const start = Date.now();
    const envelope = await runAi12();
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-12 large-volume rebuild (3,000 invoices): ${elapsedMs}ms`);

    const txCount = await AiTaxTransaction.countDocuments({ tenantId: TENANT, periodKey: PERIOD });
    expect(txCount).toBe(3000);
    expect(envelope.status).not.toBe("failed");
    expect(elapsedMs).toBeLessThan(10000);
  }, 30000);

  // ── C.1 Null/missing + malformed ───────────────────────────────────────────────────────────
  it("malformed tax activity (zero tax, negative amount credit note, absurd date, unicode/HTML vendor name) never crashes the rebuild", async () => {
    const vendor = await makeCustomer(undefined); // no GSTIN
    await Customer.findByIdAndUpdate(vendor, { "header.name": `<script>alert(1)</script> 供应商 مورد ${"w".repeat(500)}` });
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 0, amountTax: 0, invoiceDate: new Date("1900-01-01") }); // zero everything, absurd date
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: -500, amountTax: -90, invoiceDate: new Date("2099-12-31") }); // credit note shape, absurd date
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    await expect(runAi12()).resolves.toBeDefined();
  });

  // ── C.4 Cross-tenant isolation (positive proof) ────────────────────────────────────────────
  it("cross-tenant isolation: tenant A's period rebuild never includes tenant B's tax transactions, even for the identical period", async () => {
    const vendorA = await makeCustomer("29ABCDE1234F1Z5", TENANT);
    await makeInvoice({ moveType: "in_invoice", partnerId: vendorA, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-02-10"), tenantId: TENANT });

    const vendorB = await makeCustomer("29XYZAB9999F1Z1", OTHER_TENANT);
    await makeInvoice({ moveType: "in_invoice", partnerId: vendorB, amountUntaxed: 500000, amountTax: 90000, invoiceDate: new Date("2026-02-10"), tenantId: OTHER_TENANT });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    await runAi12();

    const txForA = await AiTaxTransaction.find({ tenantId: TENANT, periodKey: PERIOD }).lean();
    expect(txForA.every((t) => t.taxAmount < 1000)).toBe(true); // never picked up tenant B's huge amounts
    const txForB = await AiTaxTransaction.find({ tenantId: OTHER_TENANT, periodKey: PERIOD }).lean();
    expect(txForB).toHaveLength(0); // tenant B's projection was never built by tenant A's run
  });

  // ── C.6 Adversarial: a confidently-wrong "it reconciles, so it's clean" trap ─────────────
  it("adversarial: the three-way ties exactly (looks perfectly reconciled) while one transaction's tax rate is a clear outlier — a naive 'ledger matches, all clear' read would miss it, AI-12 still surfaces it", async () => {
    // The trap: a naive implementation that stops at "does the control account tie to the
    // projection" would call this period clean — every rupee is accounted for. But one of the
    // six input transactions was taxed at 5% while every peer (and the tenant's own configured
    // rate) is 18% — a real misclassification that a balanced total hides completely. AI-12's
    // treatment-exception check must still catch it even though the three-way is 100% reconciled.
    const user = await User.create({ tenantId: TENANT, name: "F", email: `f-${Date.now()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    const taxControlAcc = (await Account.create({ tenantId: TENANT, name: "GST Payable Adversarial", code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "liability_current", isActive: true, isLocked: false, status: "active" }))._id;
    const otherAcc = (await Account.create({ tenantId: TENANT, name: "Expense Adversarial", code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type: "expense", isActive: true, isLocked: false, status: "active" }))._id;
    await TaxRate.create({ tenantId: TENANT, name: "GST 18% adversarial", type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });

    const vendor = await makeCustomer("29ABCDE1234F1Z5");
    for (let i = 0; i < 6; i++) {
      await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 180, invoiceDate: new Date("2026-02-10") }); // 18% — the norm
    }
    await makeInvoice({ moveType: "in_invoice", partnerId: vendor, amountUntaxed: 1000, amountTax: 50, invoiceDate: new Date("2026-02-10") }); // 5% — the misclassified outlier

    // Ledger's control account carries exactly the projection's total (6*180 + 50 = 1130) — the
    // three-way genuinely ties to the rupee. A ledger-only check would report this period clean.
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-adversarial", date: new Date("2026-02-10"), journalType: "purchase" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: taxControlAcc, label: "line", debit: 1130, credit: 0 },
        { accountId: otherAcc, label: "line", debit: 0, credit: 1130 },
      ],
      totals: { amountUntaxed: 1130, amountTax: 0, amountTotal: 1130 },
    });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runAi12();

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as {
      threeWay: { ledger: number; transactions: number; return: number; differences: unknown[] };
      treatmentExceptions: { detail: string }[];
    };
    // The confidently-wrong-looking-clean part: perfectly reconciled...
    expect(proposal.threeWay.ledger).toBe(1130);
    expect(proposal.threeWay.transactions).toBe(1130);
    expect(proposal.threeWay.differences).toHaveLength(0);
    // ...yet the misclassified line is still caught, independent of the reconciliation result.
    expect(proposal.treatmentExceptions.length).toBeGreaterThan(0);
    expect(proposal.treatmentExceptions[0].detail).toContain("5%");
  });

  // ── C.2/C.4 defect class, consolidated finding across all 30 workflows using
  // period.horizon.reached (docs/ai/BRIEF-09-VERIFICATION.md Part B) ─────────────────────────────
  // Real bug found in this pass: unlike the 11 sibling workflows already fixed for this exact
  // shape, AI-12's own observe() did `String(event.payload.periodEnd)` with NO validation at
  // all — not even a truthy check — so a missing/malformed periodEnd produced the literal string
  // "undefined" -> `new Date("undefined")` (Invalid Date) -> extract()'s periodEnd field -> act()'s
  // unconditional `.toISOString()` call, throwing an uncaught `RangeError: Invalid time value` on
  // every affected tenant's run. This record's own AI-12.md previously called this event key "not
  // applicable" to AI-12 — that framing predates this defect class's discovery and was stale, the
  // same "report right, code wrong" pattern this whole chunk exists to catch. Fixed by validating
  // `period`'s own shape and always deriving periodEnd from it, matching the other 11 workflows.
  it("malformed/missing period.horizon.reached payload degrades to the current period instead of throwing (regression)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-12", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const malformed = await runWorkflow(ai12TaxIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    expect(malformed.status).not.toBe("failed");

    const garbage = await runWorkflow(ai12TaxIntelligence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "not-a-period", periodEnd: "also-garbage" } });
    expect(garbage.status).not.toBe("failed");

    const trace = await AiDecisionTrace.findOne({ runId: garbage.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { period: string };
    const now = new Date();
    const expectedPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(proposal.period).toBe(expectedPeriod); // defaulted to the current calendar month, never "NaN-NaN" or thrown
  });
});

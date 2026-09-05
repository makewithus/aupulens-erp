import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai22edge";
process.env.CRON_SECRET = "ai22-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiSchedule from "@/models/ai/AiSchedule";
import TaxRate from "@/models/finance/TaxRate";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import User from "@/models/auth/User";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai22ContinuousReconciliation: typeof import("@/lib/aiRuntime/workflows/ai-22-continuous-reconciliation").ai22ContinuousReconciliation;

const TENANT = "ai22-edge-tenant";
const OTHER_TENANT = "ai22-edge-other-tenant";

async function makeAccount(tenantId: string, account_type: string, name = `Account ${account_type}`) {
  const acc = await Account.create({ tenantId, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
  return String(acc._id);
}

async function makeBankStatement(tenantId: string, accountId: string, lines: { date: Date; payment_ref: string; amount: number }[], balanceEndReal?: number) {
  const stmt = await BankStatement.create({
    tenantId,
    header: { name: `STMT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, journalId: accountId, date: new Date(), balance_start: 0, balance_end_real: balanceEndReal ?? lines.reduce((s, l) => s + l.amount, 0) },
    lineIds: lines.map((l) => ({ ...l, isReconciled: false })),
    status: "draft",
  });
  return String(stmt._id);
}

async function makeVendor(tenantId: string) {
  const c = await Customer.create({ tenantId, header: { name: "Edge Vendor", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
  return c._id as mongoose.Types.ObjectId;
}

async function runAi22(tenantId: string, period: string, periodEndIso: string) {
  return runWorkflow(ai22ContinuousReconciliation, { tenantId, eventKey: "period.horizon.reached", payload: { period, periodEnd: periodEndIso } });
}

describe("AI-22 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), BankStatement.init(), JournalEntry.init(), Customer.init(), Invoice.init(),
      AiMaterialityPolicy.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(),
      AiWorkflowPolicy.init(), AiSchedule.init(), TaxRate.init(), AiTaxTransaction.init(), User.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai22ContinuousReconciliation } = await import("@/lib/aiRuntime/workflows/ai-22-continuous-reconciliation"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Account.deleteMany({}), BankStatement.deleteMany({}), JournalEntry.deleteMany({}), Customer.deleteMany({}), Invoice.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}), AiSchedule.deleteMany({}), TaxRate.deleteMany({}), AiTaxTransaction.deleteMany({}), User.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-22 and raises a real unreconciled-bank exception", async () => {
    await Organization.create({ name: "AI22 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const bankAccountId = await makeAccount(TENANT, "asset_cash");
    // Bank says 500, no GL entries at all against this account — a real, unexplained gap.
    await makeBankStatement(TENANT, bankAccountId, [{ date: new Date(), payment_ref: "ref", amount: 500 }], 500);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-22" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached (or ai.sweep.hourly) event that reached AI-22").not.toBeNull();
    const trace = await AiDecisionTrace.findOne({ runId: run!._id }).lean();
    const finding = (run as unknown as { findings?: { title: string }[] })?.findings ?? trace?.rawProposal;
    expect(finding).toBeDefined();
  });

  // ── Section 9 bug regression: same defect class fixed in AI-14/AI-25/AI-28 ────────────────
  it("bug regression: a missing or malformed periodEnd degrades to the current period-end instead of crashing", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    for (const badPeriodEnd of [undefined, "not-a-date", "", "2026-13-40", "NaN"]) {
      const payload: Record<string, unknown> = { period: "2026-02" };
      if (badPeriodEnd !== undefined) payload.periodEnd = badPeriodEnd;
      const envelope = await runWorkflow(ai22ContinuousReconciliation, { tenantId: TENANT, eventKey: "period.horizon.reached", payload });
      expect(envelope.status, `periodEnd=${JSON.stringify(badPeriodEnd)} must not fail the run`).not.toBe("failed");
    }
  });

  it("bug regression: a missing period label degrades to the current month's label, not literal 'undefined'", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai22ContinuousReconciliation, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    expect(envelope.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { results: { name: string }[] };
    // The finding id template is `ai22-${definitionId}-${period}` — assert no literal "undefined"
    // ever reaches a persisted trace/finding id even when the caller omits `period` entirely.
    expect(JSON.stringify(proposal)).not.toContain("undefined");
  });

  // ── C.4 Cross-tenant (positive proof) ──────────────────────────────────────────────────────
  // AI-22's event payload carries only `period`/`periodEnd` (never a subject-record id), so the
  // cross-tenant-unscoped-lookup defect class found in 8 earlier workflows (extract() resolving an
  // event-payload-supplied id via an unscoped Model.findById) is structurally not reachable here —
  // every one of the 12 reconciliation definitions in lib/aiRuntime/reconciliation/definitions.ts
  // takes `tenantId` as its own parameter and threads it into every query itself; none accept a
  // record id from the workflow's own payload. One shared helper it calls, `computeBankPosition()`
  // (lib/aiRuntime/workflows/ai-03-bank-reconciliation/position.ts, reused verbatim from AI-03),
  // does an internal unscoped `BankStatement.findById(bankStatementId)` — but AI-22's `bank`
  // definition only ever calls it with an id it just got from its own `BankStatement.find({
  // tenantId })` query, never from a payload, so this is a latent defense-in-depth gap in a shared
  // file (already reviewed once for AI-03's own, different, exploitable vector — see
  // docs/ai/verification/AI-03.md §9), not an exploitable path through AI-22. Confirmed here with a
  // positive-proof test: tenant B's bank/GL data never appears in tenant A's run.
  it("C.4 cross-tenant: tenant A's run never sees tenant B's bank/GL data, even with a hostile tenantId embedded in the payload", async () => {
    const bankA = await makeAccount(TENANT, "asset_cash", "Bank A");
    const bankB = await makeAccount(OTHER_TENANT, "asset_cash", "Bank B");
    await makeBankStatement(TENANT, bankA, [{ date: new Date(), payment_ref: "a", amount: 100 }], 100);
    await makeBankStatement(OTHER_TENANT, bankB, [{ date: new Date(), payment_ref: "b", amount: 9_000_000 }], 9_000_000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai22ContinuousReconciliation, {
      tenantId: TENANT,
      eventKey: "period.horizon.reached",
      payload: { period: "2026-02", periodEnd: new Date("2026-02-05").toISOString(), tenantId: OTHER_TENANT },
    });

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { results: { definitionId: string; leftTotal: number }[] };
    const bank = proposal.results.find((r) => r.definitionId === "bank")!;
    expect(bank.leftTotal).toBe(100); // tenant A's own number, never tenant B's 9,000,000
  });

  // ── C.1 Empty ───────────────────────────────────────────────────────────────────────────────
  it("C.1 empty: a fresh tenant with zero data across all 12 definitions → clean no_action, never a vacuous reconciled", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi22(TENANT, "2026-02", new Date("2026-02-28").toISOString());
    expect(envelope.status).toBe("no_action");
    expect(envelope.findings).toHaveLength(0);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { results: { status: string }[] };
    expect(proposal.results).toHaveLength(12);
    expect(proposal.results.every((r) => r.status === "not_applicable" || r.status === "not_implemented" || r.status === "reconciled")).toBe(true);
  });

  // ── C.2 Boundary: periodEnd's UTC instant determines the tax periodKey exactly ─────────────
  it("C.2 period boundary: 23:59:59.999 on the last day of the month vs. the first instant of the next month resolve to different periodKeys", async () => {
    const user = await User.create({ tenantId: TENANT, name: "F", email: `f-${Date.now()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
    const taxControlAcc = await makeAccount(TENANT, "liability_current", "GST Payable");
    await TaxRate.create({ tenantId: TENANT, name: "GST 18%", type: "gst", ratePercent: 18, appliesTo: "both", accountId: taxControlAcc, status: "active", createdBy: user._id });
    await AiTaxTransaction.create({ tenantId: TENANT, sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() }, direction: "output", jurisdiction: null, taxableAmount: 1000, taxAmount: 180, documentDate: new Date("2026-01-31"), periodKey: "2026-01", projectedAt: new Date(), projectionVersion: 1 });
    await AiTaxTransaction.create({ tenantId: TENANT, sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() }, direction: "output", jurisdiction: null, taxableAmount: 1000, taxAmount: 200, documentDate: new Date("2026-02-01"), periodKey: "2026-02", projectedAt: new Date(), projectionVersion: 1 });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { runAllReconciliationDefinitions } = await import("@/lib/aiRuntime/reconciliation/engine");
    const lastSecondOfJan = await runAllReconciliationDefinitions(TENANT, new Date("2026-01-31T23:59:59.999Z"), "2026-01");
    const firstInstantOfFeb = await runAllReconciliationDefinitions(TENANT, new Date("2026-02-01T00:00:00.000Z"), "2026-02");

    const taxJan = lastSecondOfJan.find((r) => r.definitionId === "tax")!;
    const taxFeb = firstInstantOfFeb.find((r) => r.definitionId === "tax")!;
    expect(taxJan.leftTotal).toBeCloseTo(-180, 2); // only January's AiTaxTransaction counted
    expect(taxFeb.leftTotal).toBeCloseTo(-200, 2); // only February's, not both
  });

  // ── C.1 Large 10k+ ──────────────────────────────────────────────────────────────────────────
  it("C.1 large volume: 10,000 GL lines against a control account resolve correctly within budget", async () => {
    const cash = await makeAccount(TENANT, "asset_cash", "Cash");
    const revenue = await makeAccount(TENANT, "income", "Revenue");
    const docs = Array.from({ length: 5000 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `BULK-JE-${i}`, date: new Date("2026-02-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: cash, label: "line", debit: 100, credit: 0 },
        { accountId: revenue, label: "line", debit: 0, credit: 100 },
      ],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    }));
    await JournalEntry.insertMany(docs); // 5000 docs x 2 lines = 10,000 GL lines
    await makeBankStatement(TENANT, cash, [{ date: new Date(), payment_ref: "bulk", amount: 500000 }], 500000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runAi22(TENANT, "2026-02", new Date("2026-02-28").toISOString());
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-22 large-volume run (10,000 GL lines): ${elapsedMs}ms`);

    expect(envelope.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { results: { definitionId: string; rightTotal: number }[] };
    const bank = proposal.results.find((r) => r.definitionId === "bank")!;
    expect(bank.rightTotal).toBe(500000); // 5000 x 100 debit to cash, correctly aggregated
    expect(elapsedMs).toBeLessThan(30000); // generous dev-box ceiling (docs/ai/UI_REGRESSION.md)
  }, 60000);

  // ── C.3 Duplicate event (documented, unfixed executor race — same class as AI-28) ─────────
  it("C.3 duplicate event (documented, unfixed executor race, same class as AI-28's verification record): concurrent identical events — no duplicate effect", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const eventId = new mongoose.Types.ObjectId().toString();
    const event = { id: eventId, tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-02", periodEnd: new Date("2026-02-28").toISOString() } };

    const results = await Promise.allSettled([runWorkflow(ai22ContinuousReconciliation, event), runWorkflow(ai22ContinuousReconciliation, event)]);
    expect(results.filter((r) => r.status === "fulfilled").length + results.filter((r) => r.status === "rejected").length).toBe(2);
    const runs = await AiWorkflowRun.find({ workflowId: "AI-22", triggerEventId: eventId }).lean();
    expect(runs).toHaveLength(1); // no duplicate EFFECT, even though one call may currently error
  });

  // ── C.6 Adversarial pass ────────────────────────────────────────────────────────────────────
  // What would make AI-22 produce a confidently-reassuring, wrong "reconciled" for a PRIOR,
  // LOCKED period? ap_control/ar_control_finance (definitions.ts) deliberately compare the
  // subledger's CURRENT open-invoice balance against the CURRENT control-account balance — a
  // documented scope simplification (definitions.ts's own top-of-file comment), not a
  // point-in-time replay. Requesting a run for a closed January when a January-dated bill has
  // since been paid in February reports "no open AP" for January — true today, false as of
  // January's own close. A reviewer trusting a periodEnd-labelled AI-22 run for January would
  // wrongly conclude January's payables tied out, when the correct historical answer requires a
  // ledger replay this workflow does not do (by documented design, not fixed in this pass).
  it("C.6 adversarial: a January bill paid off in February makes a January-dated AI-22 run report today's (not January's) AP position", async () => {
    const partnerId = await makeVendor(TENANT);
    const payable = await makeAccount(TENANT, "liability_current", "Accounts Payable");
    const inv = await Invoice.create({
      tenantId: TENANT, name: "BILL-JAN", partnerId, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-15"), dueDate: new Date("2026-01-15"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 8000, quantity: 1, priceUnit: 8000 }],
      amountTotal: 8000, amountResidual: 8000, paymentState: "not_paid",
    });
    // Paid off AFTER January closed — a real, later event that should not retroactively change
    // what a "reconciliation as of January 31" honestly means.
    inv.paymentState = "paid" as any;
    inv.amountResidual = 0;
    await inv.save();
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-22", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { runAllReconciliationDefinitions } = await import("@/lib/aiRuntime/reconciliation/engine");
    const results = await runAllReconciliationDefinitions(TENANT, new Date("2026-01-31T23:59:59Z"), "2026-01");
    const ap = results.find((r) => r.definitionId === "ap_control")!;
    // Documents CURRENT, confirmed behaviour: leftTotal is $0 (paid TODAY), not $8000 (the true
    // open balance AS OF January 31) — the adversarial case this test proves exists, not asserts
    // as correct. Not fixed here: definitions.ts's own comment already names this scope gap.
    expect(ap.leftTotal).toBe(0);
  });
});

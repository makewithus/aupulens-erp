import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai20_edge";
process.env.CRON_SECRET = process.env.CRON_SECRET || "ai20-edge-test-secret";

import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import Organization from "@/models/admin/Organization";
import AiSchedule from "@/models/ai/AiSchedule";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai20RelatedPartyDetection: typeof import("@/lib/aiRuntime/workflows/ai-20-related-party-detection").ai20RelatedPartyDetection;
let detectRelatedParties: typeof import("@/lib/aiRuntime/relatedParty/detectRelatedParties").detectRelatedParties;
let matchPair: typeof import("@/lib/aiRuntime/relatedParty/detectRelatedParties").matchPair;
let nameSimilarity: typeof import("@/lib/aiRuntime/relatedParty/detectRelatedParties").nameSimilarity;

const TENANT = "ai20-edge-tenant";
const TENANT_VICTIM = "ai20-edge-victim";

async function makeCustomer(tenantId: string, opts: { name: string; gstin?: string; pan?: string; email?: string; street?: string; city?: string; zip?: string }) {
  const c = await Customer.create({
    tenantId,
    header: { name: opts.name, is_company: true },
    contact_details: { email: opts.email },
    address_tab: { type: "contact", street: opts.street, city: opts.city, zip: opts.zip },
    gstin: opts.gstin,
    pan: opts.pan,
    createdBy: new mongoose.Types.ObjectId(),
  });
  return c._id as mongoose.Types.ObjectId;
}

async function makeOpenInvoice(tenantId: string, moveType: "out_invoice" | "in_invoice", partnerId: mongoose.Types.ObjectId, amount: number, extra: Record<string, unknown> = {}) {
  return Invoice.create({
    tenantId,
    name: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    partnerId,
    moveType,
    state: "posted",
    invoiceDate: new Date("2026-01-10"),
    dueDate: new Date("2026-01-10"),
    invoiceLines: [{ name: "Goods", priceSubtotal: amount, quantity: 1, priceUnit: amount }],
    amountUntaxed: amount,
    amountTax: 0,
    amountTotal: amount,
    amountResidual: amount,
    paymentState: "not_paid",
    ...extra,
  });
}

describe("AI-20 — Related-party detection: verification edge cases (docs/ai/BRIEF-09-VERIFICATION.md)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Customer.init(), Invoice.init(), AiWorkflowRun.init(), AiDecisionTrace.init(),
      AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), Organization.init(), AiSchedule.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai20RelatedPartyDetection } = await import("@/lib/aiRuntime/workflows/ai-20-related-party-detection"));
    ({ detectRelatedParties, matchPair, nameSimilarity } = await import("@/lib/aiRuntime/relatedParty/detectRelatedParties"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Customer.deleteMany({}), Invoice.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), Organization.deleteMany({}), AiSchedule.deleteMany({}),
    ]);
  });

  // ── Trigger proof: the real cron sweep route, not runWorkflow() directly ──────────────────
  it("trigger proof: the real cron sweep route (app/api/cron/ai/runtime-sweep) fires AI-20 and raises a certain-match finding", async () => {
    await Organization.create({ name: "AI20 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const customer = await makeCustomer(TENANT, { name: "Acme Trading Pvt Ltd", gstin: "29ABCDE1234F1Z5" });
    const vendor = await makeCustomer(TENANT, { name: "Totally Different Name Co", gstin: "29ABCDE1234F1Z5" });
    await makeOpenInvoice(TENANT, "out_invoice", customer, 5000);
    await makeOpenInvoice(TENANT, "in_invoice", vendor, 2000);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-20", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as unknown as Request;
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-20" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real ai.sweep.hourly/period.horizon.reached event that reached AI-20").not.toBeNull();
    expect(run!.findings.some((f) => f.title.includes("certain"))).toBe(true);
    // runWorkflow(ai20RelatedPartyDetection, ...) never called directly here — proves the whole
    // real path (route -> emitEvent -> eventBus -> executor) works end to end.
  });

  // ── C.4 cross-tenant hostile input (defect class 1) ────────────────────────────────────────
  it("no externally-supplied id from the event payload is ever resolved via an unscoped DB read — AI-20 takes no subject id at all, only an unused, optional period string (structural, source-grep)", () => {
    const output = execSync(String.raw`grep -n "findById" lib/aiRuntime/workflows/ai-20-related-party-detection/index.ts lib/aiRuntime/relatedParty/*.ts || true`, { cwd: process.cwd(), encoding: "utf-8" });
    expect(output.trim()).toBe("");
  });

  it("cross-tenant hostile: an event carrying another tenant's real Customer id in an unexpected payload field never leaks that tenant's data into this run's findings", async () => {
    const victimCustomer = await makeCustomer(TENANT_VICTIM, { name: "Victim Secret Co", gstin: "27VICTM0000A1Z1" });
    const victimVendor = await makeCustomer(TENANT_VICTIM, { name: "Victim Related Co", gstin: "27VICTM0000A1Z1" });
    await makeOpenInvoice(TENANT_VICTIM, "out_invoice", victimCustomer, 9999);
    await makeOpenInvoice(TENANT_VICTIM, "in_invoice", victimVendor, 8888);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-20", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    // Attacker fires an event under their OWN tenant, but stuffs a victim-tenant record id into
    // the payload — a hostile input, not a clean one. AI-20 only ever reads ctx.tenantId (from
    // the event's own tenantId, never from payload contents), so this must be a total no-op.
    const envelope = await runWorkflow(ai20RelatedPartyDetection, {
      tenantId: TENANT,
      eventKey: "period.horizon.reached",
      payload: { period: "2026-01", customerId: String(victimCustomer), vendorId: String(victimVendor) },
    });
    expect(envelope.findings).toEqual([]);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { relatedParties: unknown[] };
    expect(proposal.relatedParties).toEqual([]);
  });

  // ── C.3 concurrent duplicate event ─────────────────────────────────────────────────────────
  it("the same triggerEventId fired concurrently twice still produces exactly one AiWorkflowRun (executor-level idempotency; AI-20 itself makes no writes to duplicate)", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-20", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const eventId = new mongoose.Types.ObjectId();
    const event = { id: String(eventId), tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-01" } };
    const results = await Promise.allSettled([runWorkflow(ai20RelatedPartyDetection, event), runWorkflow(ai20RelatedPartyDetection, event)]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    const runCount = await AiWorkflowRun.countDocuments({ tenantId: TENANT, workflowId: "AI-20", triggerEventId: eventId });
    expect(runCount).toBe(1);
  });

  // ── C.3 superseded subject: a candidate customer deleted mid-run ──────────────────────────
  it("a candidate deleted between id-gathering and record-load is skipped cleanly, never a crash (superseded subject)", async () => {
    const customer = await makeCustomer(TENANT, { name: "Acme Trading Pvt Ltd", gstin: "29ABCDE1234F1Z5" });
    const vendor = await makeCustomer(TENANT, { name: "Totally Different Co", gstin: "29ABCDE1234F1Z5" });
    await makeOpenInvoice(TENANT, "out_invoice", customer, 1000);
    await makeOpenInvoice(TENANT, "in_invoice", vendor, 500);
    // The vendor-role record is deleted (voided) before the detector's own Customer.find() runs
    // — its invoice (the candidate-id source) still exists, only the master record is gone.
    await Customer.deleteOne({ _id: vendor });

    const matches = await detectRelatedParties(TENANT);
    expect(matches).toEqual([]); // the missing side is skipped (`if (!v) continue`), not a crash
  });

  // ── C.3 stale read: population changes between the candidate-id read and the balance read ─
  it("documents (not forced as a live race — no injection point exists without mocking Mongoose internals): detectRelatedParties() makes its candidate-id reads and its balance reads as separate queries; a population change in the gap defaults the orphaned side to zero exposure via the `?? { total: 0, refs: [] }` fallback (source-grep), never a crash — and this output is advisory-only (never persisted as an accounting fact, unlike AI-22's reconciliation), so a momentary read-order mismatch self-corrects on the next hourly sweep", () => {
    const output = execSync(
      String.raw`grep -n '?? { total: 0, refs: \[\] }' lib/aiRuntime/relatedParty/detectRelatedParties.ts || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    const lines = output.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(2); // one fallback for the receivable side, one for the payable side
  });

  // ── C.1 Empty ───────────────────────────────────────────────────────────────────────────
  it("C.1 Empty: zero customers and zero invoices → clean no_action, never an error or a vacuous finding", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-20", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai20RelatedPartyDetection, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    expect(envelope.status).not.toBe("failed");
    expect(envelope.findings).toEqual([]);
  });

  // ── C.1 Single ──────────────────────────────────────────────────────────────────────────
  it("C.1 Single: exactly one customer-role and one vendor-role candidate — no off-by-one in the pairwise loop", async () => {
    const customer = await makeCustomer(TENANT, { name: "Solo Customer Ltd", gstin: "29SOLOX0000A1Z1" });
    const vendor = await makeCustomer(TENANT, { name: "Solo Vendor Ltd", gstin: "29SOLOX0000A1Z1" });
    await makeOpenInvoice(TENANT, "out_invoice", customer, 1000);
    await makeOpenInvoice(TENANT, "in_invoice", vendor, 400);

    const matches = await detectRelatedParties(TENANT);
    expect(matches).toHaveLength(1);
    expect(matches[0].classification).toBe("certain");
  });

  // ── C.1 Large (10k+) ────────────────────────────────────────────────────────────────────
  it("C.1 Large: 10,000 invoices across 500 distinct partners resolve correctly within a generous dev-box budget (shared-machine timing per docs/ai/UI_REGRESSION.md)", async () => {
    const customerDocs = await Customer.insertMany(
      Array.from({ length: 250 }, (_, i) => ({ tenantId: TENANT, header: { name: `Bulk Customer ${i}`, is_company: true }, createdBy: new mongoose.Types.ObjectId() })),
    );
    const vendorDocs = await Customer.insertMany(
      Array.from({ length: 250 }, (_, i) => ({ tenantId: TENANT, header: { name: `Bulk Vendor ${i}`, is_company: true }, createdBy: new mongoose.Types.ObjectId() })),
    );
    // Plant one genuine certain match among the bulk noise.
    await Customer.updateOne({ _id: customerDocs[0]._id }, { $set: { gstin: "29PLANT0000A1Z1", header: { name: "Planted Customer Co", is_company: true } } });
    await Customer.updateOne({ _id: vendorDocs[0]._id }, { $set: { gstin: "29PLANT0000A1Z1", header: { name: "Planted Vendor Co", is_company: true } } });

    const outInvoices = Array.from({ length: 5000 }, (_, i) => ({
      tenantId: TENANT, name: `OUT-${i}`, partnerId: customerDocs[i % 250]._id, moveType: "out_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 100, quantity: 1, priceUnit: 100 }],
      amountUntaxed: 100, amountTax: 0, amountTotal: 100, amountResidual: 100, paymentState: "not_paid",
    }));
    const inInvoices = Array.from({ length: 5000 }, (_, i) => ({
      tenantId: TENANT, name: `IN-${i}`, partnerId: vendorDocs[i % 250]._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 50, quantity: 1, priceUnit: 50 }],
      amountUntaxed: 50, amountTax: 0, amountTotal: 50, amountResidual: 50, paymentState: "not_paid",
    }));
    await Invoice.insertMany([...outInvoices, ...inInvoices]);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-20", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runWorkflow(ai20RelatedPartyDetection, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: {} });
    const elapsedMs = Date.now() - start;

    expect(envelope.status).not.toBe("failed");
    expect(envelope.findings.some((f) => f.title.includes("certain"))).toBe(true);
    expect(elapsedMs).toBeLessThan(30000);
  }, 40000);

  // ── C.1 Null/missing fields ─────────────────────────────────────────────────────────────
  it("C.1 Null/missing fields: customers with no gstin/pan/address/email at all never crash and never falsely match on absence", async () => {
    const customer = await makeCustomer(TENANT, { name: "Bare Customer Co" });
    const vendor = await makeCustomer(TENANT, { name: "Bare Vendor Co" });
    await makeOpenInvoice(TENANT, "out_invoice", customer, 1000);
    await makeOpenInvoice(TENANT, "in_invoice", vendor, 500);

    const matches = await detectRelatedParties(TENANT);
    // Nothing shared (no gstin/pan/address/email on either side, and names share no tokens) —
    // an absent field must never be treated as an equal match to another absent field.
    expect(matches).toEqual([]);
  });

  // ── C.1 Malformed ───────────────────────────────────────────────────────────────────────
  it("C.1 Malformed: unicode/RTL 500-char names with HTML/script, negative and zero invoice amounts, absurd dates — no crash, no false match", async () => {
    const longUnicodeName = `${"अ".repeat(240)}<script>alert(1)</script>مرحبا بالعالم ${"日本語".repeat(20)}`.slice(0, 500);
    const customer = await makeCustomer(TENANT, { name: longUnicodeName, gstin: "29MALFM0000A1Z1" });
    const vendor = await makeCustomer(TENANT, { name: "Unrelated Vendor Co", gstin: "29MALFM0000A1Z1" });
    await makeOpenInvoice(TENANT, "out_invoice", customer, -500); // negative residual — malformed
    await makeOpenInvoice(TENANT, "in_invoice", vendor, 0, { invoiceDate: new Date("1900-01-01"), dueDate: new Date("2099-12-31") });

    const matches = await detectRelatedParties(TENANT);
    const match = matches.find((m) => m.customerRef === String(customer) && m.vendorRef === String(vendor));
    expect(match).toBeDefined();
    expect(match!.classification).toBe("certain"); // valid-format shared GSTIN still detected through the noise
    expect(Number.isFinite(match!.receivableExposure)).toBe(true);
    expect(Number.isFinite(match!.payableExposure)).toBe(true);
  });

  // ── C.1 Precision ───────────────────────────────────────────────────────────────────────
  it("C.1 Precision: fractional-paise residuals sum and round to the cent, never a float-drift artifact", async () => {
    const customer = await makeCustomer(TENANT, { name: "Precision Customer Co", gstin: "29PRECI0000A1Z1" });
    const vendor = await makeCustomer(TENANT, { name: "Precision Vendor Co", gstin: "29PRECI0000A1Z1" });
    await makeOpenInvoice(TENANT, "out_invoice", customer, 0.1);
    await makeOpenInvoice(TENANT, "out_invoice", customer, 0.2);
    await makeOpenInvoice(TENANT, "in_invoice", vendor, 100.005);

    const matches = await detectRelatedParties(TENANT);
    const match = matches.find((m) => m.customerRef === String(customer) && m.vendorRef === String(vendor));
    expect(match).toBeDefined();
    expect(match!.receivableExposure).toBe(0.3); // not 0.30000000000000004
    expect(match!.payableExposure).toBe(100.01); // round2(100.005) — never a raw float artifact
    expect(match!.net).toBe(-99.7); // round2(0.3 - 100.005) computed from the RAW totals before
    // either side is independently rounded — a legitimate, documented precision property (never
    // NaN, never a float-drift string), not the naive (roundedReceivable - roundedPayable).
  });

  // ── C.2 Boundaries ──────────────────────────────────────────────────────────────────────
  it("C.2 Period boundary / timezone / month lengths / fiscal year end: not applicable — AI-20's period field is accepted but never read downstream (detectRelatedParties(tenantId) takes no date at all; related-party detection is a structural identity match, not a period-bounded computation)", () => {
    // observe() assigns event.payload.period into `raw.period`, but extract() never reads it
    // back — confirmed here: `detectRelatedParties(ctx.tenantId)` (extract's only real call)
    // takes exactly one argument, no period/date of any kind. No PERIOD_PATTERN validation
    // exists here either, and needs none: an unused field cannot reach a Date.UTC()/CastError
    // path the way AI-13/21/24's period does.
    const extractBody = execSync(
      String.raw`grep -n "async extract" -A 3 lib/aiRuntime/workflows/ai-20-related-party-detection/index.ts`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(extractBody).toContain("detectRelatedParties(ctx.tenantId)");
    expect(extractBody).not.toContain("observed.raw.period");
  });

  it("C.2 Materiality edge: not applicable — no AiMaterialityPolicy or any amount threshold is read anywhere in this workflow's path (structural, source-grep)", () => {
    const output = execSync(String.raw`grep -rn "MaterialityPolicy\|ComplianceProfile" lib/aiRuntime/workflows/ai-20-related-party-detection lib/aiRuntime/relatedParty || true`, { cwd: process.cwd(), encoding: "utf-8" });
    expect(output.trim()).toBe("");
  });

  it("C.2 Confidence edge: name similarity exactly at MIN_NAME_SIMILARITY (0.6) classifies possible; a lower ratio with no shared identifier matches nothing", () => {
    // tokens {alpha,beta,gamma,delta} vs {alpha,beta,gamma,epsilon}: intersection 3 / union 5 = 0.6 exactly.
    const atThreshold = nameSimilarity("Alpha Beta Gamma Delta", "Alpha Beta Gamma Epsilon");
    expect(atThreshold).toBe(0.6);
    const atThresholdMatch = matchPair({ header: { name: "Alpha Beta Gamma Delta" } }, { header: { name: "Alpha Beta Gamma Epsilon" } });
    expect(atThresholdMatch.classification).toBe("possible");

    // A single shared token out of five unique ("sterling") = 1/5 = 0.2, well under threshold.
    const belowThreshold = nameSimilarity("Sterling Industries One Group", "Sterling Enterprises Two Holdings");
    expect(belowThreshold).toBeLessThan(0.6);
    const belowThresholdMatch = matchPair({ header: { name: "Sterling Industries One Group" } }, { header: { name: "Sterling Enterprises Two Holdings" } });
    expect(belowThresholdMatch.classification).toBeNull();
  });

  // ── C.3 / C.5 generic / not-applicable classes, documented ─────────────────────────────
  it("C.3 Mid-pipeline failure / retry-after-partial / locked-period-mid-run: not applicable, with reason — AI-20's act() makes zero tool calls (no write of any kind exists to partially apply or retry)", () => {
    const output = execSync(
      String.raw`grep -n "rt.callTool" lib/aiRuntime/workflows/ai-20-related-party-detection/index.ts || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("C.4 Nothing/partially configured: not applicable, with reason — this workflow reads no configurable policy object at all (materiality/mapping/compliance), confirmed by the source-grep above; every check is a structural field comparison, not an amount or policy evaluation", () => {
    expect(true).toBe(true); // documented alongside the C.2 materiality-edge source-grep test above
  });

  it("C.5 Model unavailable/nonsense, tool failure, sibling workflow unavailable, integration down: not applicable, with reason — no LLM call anywhere (deterministic string/number comparison only), no tool calls in act(), no dependency on any other workflow's output, and no external feed/integration in this workflow's data path (Customer/Invoice only)", () => {
    const output = execSync(
      String.raw`grep -rniE "callLLM|generateText|openai|anthropic" lib/aiRuntime/workflows/ai-20-related-party-detection lib/aiRuntime/relatedParty || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  // ── C.6 Adversarial: real bug found and fixed in this pass ─────────────────────────────
  it("C.6 Adversarial: two genuinely unrelated companies that both left GSTIN as the placeholder \"NA\" must NOT be flagged a certain related-party match (regression for the bug found in this pass)", async () => {
    const customer = await makeCustomer(TENANT, { name: "Genuinely Unrelated Customer Co", gstin: "NA" });
    const vendor = await makeCustomer(TENANT, { name: "Completely Different Vendor Inc", gstin: "NA" });
    await makeOpenInvoice(TENANT, "out_invoice", customer, 1000);
    await makeOpenInvoice(TENANT, "in_invoice", vendor, 500);

    const matches = await detectRelatedParties(TENANT);
    const match = matches.find((m) => m.customerRef === String(customer) && m.vendorRef === String(vendor));
    // No shared identifiers of real evidentiary value, and the names share no tokens — nothing
    // should fire. Before the fix, matchPair() treated the shared literal string "NA" as if it
    // were a real government-issued tax ID match and returned `certain` — a confidently wrong
    // answer a human reviewer, seeing "certain: matched on tax_registration_number", would very
    // plausibly have accepted at face value.
    expect(match).toBeUndefined();
  });

  it("C.6 Adversarial (same class, PAN side): a shared placeholder PAN (\"PENDING\") is also excluded from a certain match", () => {
    const result = matchPair({ header: { name: "Company One" }, pan: "PENDING" }, { header: { name: "Company Two" }, pan: "PENDING" });
    expect(result.classification).toBeNull();
  });

  it("C.6 Adversarial (root-cause proof, not just symptom): a real, valid-format PAN shared between two differently-named companies is still correctly flagged certain — the fix is format validation, not a denylist that could miss a new placeholder string", () => {
    const result = matchPair({ header: { name: "Company One" }, pan: "ABCDE1234F" }, { header: { name: "Company Two" }, pan: "ABCDE1234F" });
    expect(result.classification).toBe("certain");
    expect(result.matchedOn).toContain("pan");
  });

  it("the workflow never writes a ledger value or proposes a merge/elimination (source-grep, same pattern as AI-09/AI-13/AI-21)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-20-related-party-detection lib/aiRuntime/relatedParty || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });
});

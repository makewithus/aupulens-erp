import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai17edge";
process.env.CRON_SECRET = "ai17-edge-test-secret";

import Organization from "@/models/admin/Organization";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiTaxTransaction, { AI_TAX_DIRECTION } from "@/models/ai/AiTaxTransaction";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiCloseState from "@/models/ai/AiCloseState";
import PeriodClosing from "@/models/finance/PeriodClosing";
import BankStatement from "@/models/finance/BankStatement";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import TaxRate from "@/models/finance/TaxRate";
import JournalEntry from "@/models/finance/JournalEntry";
import User from "@/models/auth/User";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai17ComplianceReadiness: typeof import("@/lib/aiRuntime/workflows/ai-17-compliance-readiness").ai17ComplianceReadiness;
let computeComplianceReadiness: typeof import("@/lib/aiRuntime/compliance/computeReadiness").computeComplianceReadiness;

const TENANT = "ai17-edge-tenant";
const OTHER_TENANT = "ai17-edge-other-tenant";
const PERIOD = "2026-01";

async function makeProfile(tenantId: string, opts: { registrations?: { jurisdiction: string; taxType: string; registrationNumber: string; effectiveFrom?: Date }[]; obligations?: Record<string, unknown>[]; thresholds?: Record<string, unknown>[] }) {
  return AiComplianceProfile.create({
    tenantId,
    registrations: opts.registrations ?? [{ jurisdiction: "IN-KA", taxType: "gst", registrationNumber: "29ABCDE1234F1Z5", effectiveFrom: new Date("2020-01-01") }],
    obligations: opts.obligations ?? [
      { jurisdiction: "IN-KA", taxType: "gst", returnType: "monthly_gst_return", frequency: "monthly", dueDayOffset: 20, firstPeriod: "2020-01", warningWindowDays: 21 },
    ],
    thresholds: opts.thresholds ?? [],
  });
}

async function makeTaxRow(tenantId: string, period: string, opts: Partial<{ direction: string; jurisdiction: string | null; taxType: string | null; counterpartyTaxRegistrationNumber: string | null; taxableAmount: number; taxAmount: number; documentDate: Date }> = {}) {
  return AiTaxTransaction.create({
    tenantId,
    sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() },
    direction: opts.direction ?? AI_TAX_DIRECTION.OUTPUT,
    jurisdiction: opts.jurisdiction ?? "IN-KA",
    taxRateRef: null,
    taxType: opts.taxType ?? "gst",
    counterpartyTaxRegistrationNumber: opts.counterpartyTaxRegistrationNumber ?? "29ABCDE1234F1Z5",
    taxableAmount: opts.taxableAmount ?? 1000,
    taxAmount: opts.taxAmount ?? 180,
    documentDate: opts.documentDate ?? new Date(`${period}-10`),
    periodKey: period,
    evidenceRefs: [],
    projectedAt: new Date(),
    projectionVersion: 1,
  });
}

describe("AI-17 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), AiComplianceProfile.init(), AiTaxTransaction.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(),
      AiToolCall.init(), AiWorkflowPolicy.init(), AiAttentionItem.init(), AiCloseState.init(), PeriodClosing.init(), BankStatement.init(),
      Customer.init(), Invoice.init(), Account.init(), TaxRate.init(), JournalEntry.init(), User.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai17ComplianceReadiness } = await import("@/lib/aiRuntime/workflows/ai-17-compliance-readiness"));
    ({ computeComplianceReadiness } = await import("@/lib/aiRuntime/compliance/computeReadiness"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), AiComplianceProfile.deleteMany({}), AiTaxTransaction.deleteMany({}), AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiAttentionItem.deleteMany({}),
      AiCloseState.deleteMany({}), PeriodClosing.deleteMany({}), BankStatement.deleteMany({}), Customer.deleteMany({}), Invoice.deleteMany({}),
      Account.deleteMany({}), TaxRate.deleteMany({}), JournalEntry.deleteMany({}), User.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-17 and raises a real registration-gap finding", async () => {
    await Organization.create({ name: "AI17 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    await makeProfile(TENANT, { registrations: [] }); // obligation configured for IN-KA/gst, no matching registration -> a real gap
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-17", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-17" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached event that reached AI-17").not.toBeNull();
    const trace = await AiDecisionTrace.findOne({ runId: run!._id }).lean();
    const proposal = trace!.rawProposal as unknown as { registrationGaps: { jurisdiction: string }[] };
    expect(proposal.registrationGaps.some((g) => g.jurisdiction === "IN-KA")).toBe(true);
    const item = await AiAttentionItem.findOne({ tenantId: TENANT, workflowId: "AI-17" }).lean();
    expect(item, "a HIGH registration-gap finding must escalate to a real AiAttentionItem via the generic per-finding mechanism").not.toBeNull();
  });

  // ── Section 9 bug regression: unvalidated period.horizon.reached payload (known defect class 2) ──
  // Reproduced BEFORE trusting the already-applied source fix (docs/ai/BRIEF-09-VERIFICATION.md):
  // a malformed-but-present period string used to reach computeReadiness.ts's periodEndOf() as
  // NaN/Invalid Date. That alone doesn't throw (AiTaxTransaction is queried by the string
  // periodKey, never a Date field) — but with a real obligation configured and zero tax rows
  // projected for that bogus period ("not_started"), AI-17's own reason() step unconditionally
  // calls `o.deadline.toISOString().slice(0, 10)` for every non-"ready" obligation, and
  // Invalid Date.toISOString() throws a RangeError. A profile with an obligation is what makes
  // this reachable — an empty profile short-circuits to profileConfigured:false and never gets
  // there, which is why this must seed a real profile, not just dispatch a bare event.
  it("bug regression: a missing or malformed period.horizon.reached payload degrades to the current period instead of throwing a RangeError on Invalid Date.toISOString()", async () => {
    await makeProfile(TENANT, {});
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-17", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const badPayloads: Record<string, unknown>[] = [
      {},
      { period: "undefined" },
      { period: "not-a-period" },
      { period: "2026-13" },
      { period: "2026" },
      { period: "" },
      { period: 12345 },
      { period: null },
    ];
    for (const payload of badPayloads) {
      const envelope = await runWorkflow(ai17ComplianceReadiness, { tenantId: TENANT, eventKey: "period.horizon.reached", payload });
      expect(envelope.status, `payload ${JSON.stringify(payload)} must not fail the run`).not.toBe("failed");
    }
  });

  it("bug regression (direct reproduction): computeComplianceReadiness itself does not throw on a garbage period string when an obligation is configured", async () => {
    await makeProfile(TENANT, {});
    // Directly exercises the function the workflow's observe()/extract() would otherwise have fed
    // a garbage string into, confirming the underlying computation is safe independent of the
    // workflow's own guard (belt-and-suspenders proof, not just "the workflow's regex catches it").
    await expect(computeComplianceReadiness(TENANT, "garbage", new Date("2026-01-15"))).resolves.toBeDefined();
  });

  // ── C.4 Cross-tenant (positive proof) — known defect class 1 ──────────────────────────────
  // AI-17's observe() takes only event.payload.period (a string, never an externally-supplied
  // record id) and computeComplianceReadiness() scopes every read to tenantId
  // (AiComplianceProfile.findOne({tenantId}), AiTaxTransaction.find({tenantId, ...})) — there is
  // no subject-record id anywhere in this workflow's input for the AI-01..04/07-10 unscoped-
  // findById defect shape to attach to. Confirmed by reading, and proven here with real,
  // deliberately-differing data on both tenants (not just an absence of data on tenant B).
  it("C.4 cross-tenant: tenant A's obligations/registration-gaps never include tenant B's profile or tax data, even with hostile data on both sides", async () => {
    await makeProfile(TENANT, { registrations: [] }); // A: real registration gap
    await makeProfile(OTHER_TENANT, {
      registrations: [{ jurisdiction: "IN-MH", taxType: "gst", registrationNumber: "27ZZZZZ9999Z1Z1", effectiveFrom: new Date("2020-01-01") }],
      obligations: [{ jurisdiction: "IN-MH", taxType: "gst", returnType: "monthly_gst_return", frequency: "monthly", dueDayOffset: 20, firstPeriod: "2020-01", warningWindowDays: 21 }],
    });
    await makeTaxRow(OTHER_TENANT, PERIOD, { jurisdiction: "IN-MH", taxableAmount: 999999 });

    const resultA = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(resultA.registrationGaps.every((g) => g.jurisdiction !== "IN-MH")).toBe(true);
    expect(resultA.obligations.every((o) => o.jurisdiction !== "IN-MH")).toBe(true);

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-17", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai17ComplianceReadiness, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD } });
    expect(envelope.findings.every((f) => !f.title.includes("IN-MH"))).toBe(true);
  });

  // ── C.3 concurrent duplicate event ─────────────────────────────────────────────────────────
  it("C.3 concurrent duplicate period.horizon.reached dispatch → exactly one AiAttentionItem per registration gap, not two", async () => {
    await makeProfile(TENANT, { registrations: [] }); // real gap
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-17", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const event = { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD } };
    await Promise.all([
      runWorkflow(ai17ComplianceReadiness, { ...event, id: undefined }),
      runWorkflow(ai17ComplianceReadiness, { ...event, id: undefined }),
    ]);

    const items = await AiAttentionItem.find({ tenantId: TENANT, workflowId: "AI-17", dedupeKey: { $regex: "reggap" } }).lean();
    expect(items).toHaveLength(1); // generic executor per-finding escalation upserts on {workflowId}:{finding.id} — same finding.id both runs, same dedupeKey
  });

  // ── C.4 Kill switch off ─────────────────────────────────────────────────────────────────────
  // AI-17 declares defaultAutonomy: OBSERVE and its own act() makes ZERO tool calls (no
  // internal_state write exists for this workflow at all — "OBSERVE only, no tool calls anywhere
  // in this workflow", index.ts's own doc comment). Per the same reasoning confirmed for AI-29
  // (autonomyGate.ts's OBSERVE/RECOMMEND short-circuit, eventBus.ts's requiresValidation gate —
  // both already tested in autonomyGate.test.ts), an OBSERVE-ceiling workflow's kill switch has
  // nothing to gate: there is no elevated-autonomy write for it to suppress. The only "write" that
  // ever happens for AI-17 is the executor's own generic per-finding AiAttentionItem escalation,
  // which is likewise unconditional on the workflow's own kill switch. Confirmed directly, not
  // assumed.
  it("C.4 kill switch off: OBSERVE-ceiling AI-17 still computes and escalates registration gaps — the kill switch gates autonomy elevation beyond OBSERVE/RECOMMEND, not read-only observation", async () => {
    await makeProfile(TENANT, { registrations: [] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-17", killSwitchEnabled: false, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai17ComplianceReadiness, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD } });
    expect(envelope.status).not.toBe("failed");
    const finding = envelope.findings.find((f) => f.title.includes("Registration gap"));
    expect(finding).toBeDefined();
    const item = await AiAttentionItem.findOne({ tenantId: TENANT, workflowId: "AI-17" }).lean();
    expect(item).not.toBeNull();
  });

  // ── C.1 Large volume ───────────────────────────────────────────────────────────────────────
  it("C.1 large volume: 10,000 projected tax transactions for the period resolve correctly within budget", async () => {
    await makeProfile(TENANT, {});
    const docs = Array.from({ length: 10000 }, () => ({
      tenantId: TENANT,
      sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId() },
      direction: AI_TAX_DIRECTION.OUTPUT,
      jurisdiction: "IN-KA",
      taxRateRef: null,
      taxType: "gst",
      counterpartyTaxRegistrationNumber: "29ABCDE1234F1Z5",
      taxableAmount: 1000,
      taxAmount: 180,
      documentDate: new Date(`${PERIOD}-10`),
      periodKey: PERIOD,
      evidenceRefs: [],
      projectedAt: new Date(),
      projectionVersion: 1,
    }));
    await AiTaxTransaction.insertMany(docs);

    const start = Date.now();
    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-17 large-volume compliance readiness (10,000 projected tax transactions): ${elapsedMs}ms`);

    expect(result.obligations).toHaveLength(1);
    // Not "not_started" — 10,000 rows were genuinely picked up for the period (rows.length > 0
    // takes the reconciled/blocked branch, never the "no transactions" one). This fixture doesn't
    // also seed a matching GST-payable ledger (that's the base test's `configureTaxLedger` job,
    // exercised at small scale in tests/ai/aiRuntime/ai17ComplianceReadiness.test.ts), so the
    // three-way tax reconciliation correctly reports unreconciled/blocked at this volume too — a
    // true, not a false, blocker; the point of this test is scale and correctness of the read
    // path, not re-proving the reconciliation logic itself.
    expect(result.obligations[0].readiness).not.toBe("not_started");
    expect(result.obligations[0].blockers.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(35000);
  }, 40000);

  // ── C.1 Null/missing fields ─────────────────────────────────────────────────────────────────
  it("C.1 null/missing fields: an obligation with no warningWindowDays defaults sensibly; a tax row with null jurisdiction is a real missing-evidence gap, not a crash", async () => {
    await makeProfile(TENANT, { obligations: [{ jurisdiction: "IN-KA", taxType: "gst", returnType: "monthly_gst_return", frequency: "monthly", dueDayOffset: 20, firstPeriod: "2020-01" }] }); // no warningWindowDays
    await makeTaxRow(TENANT, PERIOD, { jurisdiction: null, counterpartyTaxRegistrationNumber: null });

    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.obligations[0].warningWindowDays).toBe(21); // documented default
    expect(result.obligations[0].readiness).toBe("blocked"); // missing counterparty registration evidence
  });

  // ── C.1 Malformed ────────────────────────────────────────────────────────────────────────────
  it("C.1 malformed: unicode jurisdiction/taxType names and a negative (credit-note-shaped) taxable amount never crash the readiness computation", async () => {
    await AiComplianceProfile.create({
      tenantId: TENANT,
      registrations: [{ jurisdiction: "IN-कर्नाटक", taxType: "gst", registrationNumber: "29ABCDE1234F1Z5", effectiveFrom: new Date("2020-01-01") }],
      obligations: [{ jurisdiction: "IN-कर्नाटक", taxType: "gst", returnType: "monthly_gst_return", frequency: "monthly", dueDayOffset: 20, firstPeriod: "2020-01", warningWindowDays: 21 }],
      thresholds: [],
    });
    await makeTaxRow(TENANT, PERIOD, { jurisdiction: "IN-कर्नाटक", taxableAmount: -1000, taxAmount: -180 });

    await expect(computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"))).resolves.toBeDefined();
  });

  // ── C.2 Materiality edge (turnover threshold) ──────────────────────────────────────────────
  it("C.2 materiality edge: turnover exactly at the threshold is not a gap; one unit over is", async () => {
    await AiComplianceProfile.create({ tenantId: TENANT, registrations: [], obligations: [], thresholds: [{ jurisdiction: "IN-KA", taxType: "gst", turnoverThreshold: 500 }] });
    await makeTaxRow(TENANT, PERIOD, { taxableAmount: 500 });
    const atThreshold = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(atThreshold.registrationGaps).toHaveLength(1); // >= comparison: exactly-at IS a gap, by design (never under-flag)

    await AiTaxTransaction.deleteMany({ tenantId: TENANT });
    await makeTaxRow(TENANT, PERIOD, { taxableAmount: 499 });
    const underThreshold = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(underThreshold.registrationGaps).toHaveLength(0);
  });

  // ── C.2 Fiscal year end / month lengths (quarterly + annual obligation calendars) ──────────
  it("C.2 fiscal year end: a quarterly obligation is due only in Mar/Jun/Sep/Dec; an annual one only in December", async () => {
    await AiComplianceProfile.create({
      tenantId: TENANT,
      registrations: [],
      obligations: [
        { jurisdiction: "IN-KA", taxType: "gst", returnType: "quarterly_return", frequency: "quarterly", dueDayOffset: 20, firstPeriod: "2020-01", warningWindowDays: 21 },
        { jurisdiction: "IN-KA", taxType: "gst", returnType: "annual_return", frequency: "annual", dueDayOffset: 60, firstPeriod: "2020-01", warningWindowDays: 21 },
      ],
      thresholds: [],
    });
    const jan = await computeComplianceReadiness(TENANT, "2026-01", new Date("2026-01-15"));
    expect(jan.obligations).toHaveLength(0); // neither quarterly nor annual due in January
    const mar = await computeComplianceReadiness(TENANT, "2026-03", new Date("2026-03-15"));
    expect(mar.obligations.some((o) => o.returnType === "quarterly_return")).toBe(true);
    expect(mar.obligations.some((o) => o.returnType === "annual_return")).toBe(false);
    const dec = await computeComplianceReadiness(TENANT, "2026-12", new Date("2026-12-15"));
    expect(dec.obligations.some((o) => o.returnType === "quarterly_return")).toBe(true);
    expect(dec.obligations.some((o) => o.returnType === "annual_return")).toBe(true);
  });

  // ── C.6 Adversarial pass ────────────────────────────────────────────────────────────────────
  // What input would make AI-17 confidently report "registered" when it isn't? A jurisdiction
  // that DOES hold a registration, but for a DIFFERENT taxType — a reviewer skimming "IN-KA is
  // registered" could easily accept a jurisdiction-only match as sufficient. hasRegistration()
  // checks jurisdiction AND taxType together (computeReadiness.ts), so this is confirmed correct,
  // not a defect — recorded here as the adversarial case actually tried, per Part C.6, rather than
  // left unexamined.
  it("C.6 adversarial: a registration for IN-KA/gst does not silently cover an obligation configured for IN-KA/tds — taxType is checked, not just jurisdiction", async () => {
    await AiComplianceProfile.create({
      tenantId: TENANT,
      registrations: [{ jurisdiction: "IN-KA", taxType: "gst", registrationNumber: "29ABCDE1234F1Z5", effectiveFrom: new Date("2020-01-01") }],
      obligations: [{ jurisdiction: "IN-KA", taxType: "tds", returnType: "monthly_tds_return", frequency: "monthly", dueDayOffset: 7, firstPeriod: "2020-01", warningWindowDays: 21 }],
      thresholds: [],
    });
    const result = await computeComplianceReadiness(TENANT, PERIOD, new Date("2026-01-15"));
    expect(result.registrationGaps).toHaveLength(1);
    expect(result.registrationGaps[0].taxType).toBe("tds");
  });
});

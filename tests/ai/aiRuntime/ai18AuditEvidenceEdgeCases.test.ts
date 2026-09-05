import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai18edge";
process.env.CRON_SECRET = "ai18-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Invoice from "@/models/finance/Invoice";
import Customer from "@/models/sales/Customer";
import AccountingSettings from "@/models/finance/AccountingSettings";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiCloseState from "@/models/ai/AiCloseState";
import PeriodClosing from "@/models/finance/PeriodClosing";
import BankStatement from "@/models/finance/BankStatement";
import Asset from "@/models/finance/Asset";
import TaxRate from "@/models/finance/TaxRate";
import AiSchedule from "@/models/ai/AiSchedule";
import AiTaxTransaction from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import AiMaterialityPolicy from "@/models/ai/AiMaterialityPolicy";
import AiEvidencePack from "@/models/ai/AiEvidencePack";
import AiAttentionItem from "@/models/ai/AiAttentionItem";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai18AuditEvidence: typeof import("@/lib/aiRuntime/workflows/ai-18-audit-evidence").ai18AuditEvidence;
let buildContext: typeof import("@/lib/aiRuntime/context/contextService").buildContext;
let callToolInner: typeof import("@/lib/aiRuntime/tools/registry").callTool;

const TENANT = "ai18-edge-tenant";
const OTHER_TENANT = "ai18-edge-other-tenant";
const PERIOD = "2026-01";
const PERIOD_END = new Date("2026-01-31T23:59:59.999Z");

async function makeAccount(tenantId: string, account_type: string, internal_group: string, name: string) {
  const acc = await Account.create({ tenantId, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

async function seedAi14Comparison(tenantId: string, accountId: string, materialityVerdict: string) {
  const run = await AiWorkflowRun.create({
    tenantId, workflowId: "AI-14", workflowVersion: "1.0.0", entityId: tenantId, status: "completed", autonomyApplied: "observe", summary: "seed",
    findings: [], metrics: { scanned: 1, matched: 0, exceptions: 0, autoActioned: 0, policy_overrides: 0 }, startedAt: new Date(), finishedAt: new Date(),
  });
  await AiDecisionTrace.create({
    tenantId, runId: run._id, workflowId: "AI-14", workflowVersion: "1.0.0", inputsHash: "seed", reasonChain: [],
    rawProposal: { comparisons: [{ accountId, materialityVerdict, variance: 5000, unexplainedAmount: 5000, drivers: [] }] },
    confidenceComponents: {}, finalOutcome: "completed",
  });
}

/** Directly exercises the REAL act() with a crafted `extracted.sweptAccounts` — bypassing
 *  annotateStatement()'s own account-selection (a separate, already-tested concern: the base
 *  suite's "the workflow sweep persists an evidence pack and raises HIGH findings for unsupported
 *  material lines"). MAX_ACCOUNTS_PER_SWEEP's fix is entirely about act()'s own cap/scoring logic
 *  given ANY set of swept accounts, and standing up 20+ genuinely material-AND-unreconciled
 *  DISTINCT accounts through the real reconciliation engine isn't naturally possible — there are
 *  only ~10 reconciliation definitions total (lib/aiRuntime/reconciliation/definitions.ts), so
 *  there's no way to get more than ~10 distinct real accounts into "unreconciled" status at once.
 *  Uses the REAL act(), REAL build_evidence_pack/record_evidence_pack tools (via the real tool
 *  registry, bootstrapped exactly as the executor does it) against REAL Account documents — only
 *  the account-selection step is short-circuited. */
async function runActDirectly(tenantId: string, sweptAccounts: { accountId: string; accountName: string }[]) {
  const run = await AiWorkflowRun.create({
    tenantId, workflowId: "AI-18", workflowVersion: "1.0.0", entityId: tenantId, status: "running", autonomyApplied: "observe", startedAt: new Date(),
  });
  const runId = String(run._id);
  const ctx = await buildContext(tenantId, "AI-18", tenantId);
  const rt = {
    runId,
    callTool: async (toolName: string, args: Record<string, unknown>, opts?: { requestedAutonomy?: string; userId?: string; idempotencyKey?: string }) => {
      const { result } = await callToolInner(toolName, args, { tenantId, runId, requestedAutonomy: (opts?.requestedAutonomy as any) ?? "observe", userId: opts?.userId }, { idempotencyKey: opts?.idempotencyKey });
      return result as any;
    },
  };
  const decision = { allowed: true, autonomyApplied: "observe" as const, escalate: false, reasons: [], checks: [], clampedBy: "workflow_declared" as const };
  const reasoned = {
    proposal: { period: PERIOD, packId: `${PERIOD}-sweep`, accountPacks: [], missingEvidenceCount: 0, completenessScore: 1, sample: null },
    confidence: 1,
    findings: [],
    reasonChain: [],
  };
  const extracted = { period: PERIOD, periodEnd: PERIOD_END.toISOString(), sweptAccounts };
  const actResult = await ai18AuditEvidence.act(reasoned as any, ctx, decision as any, rt as any, extracted as any);
  return { actResult, proposal: reasoned.proposal };
}

describe("AI-18 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), JournalEntry.init(), Invoice.init(), Customer.init(), AccountingSettings.init(), ExtractedDocument.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiCloseState.init(), PeriodClosing.init(),
      BankStatement.init(), Asset.init(), TaxRate.init(), AiSchedule.init(), AiTaxTransaction.init(), AiComplianceProfile.init(), AiMaterialityPolicy.init(),
      AiEvidencePack.init(), AiAttentionItem.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai18AuditEvidence } = await import("@/lib/aiRuntime/workflows/ai-18-audit-evidence"));
    ({ buildContext } = await import("@/lib/aiRuntime/context/contextService"));
    ({ callTool: callToolInner } = await import("@/lib/aiRuntime/tools/registry"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}), Invoice.deleteMany({}), Customer.deleteMany({}), AccountingSettings.deleteMany({}),
      ExtractedDocument.deleteMany({}), User.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiCloseState.deleteMany({}), PeriodClosing.deleteMany({}), BankStatement.deleteMany({}),
      Asset.deleteMany({}), TaxRate.deleteMany({}), AiSchedule.deleteMany({}), AiTaxTransaction.deleteMany({}), AiComplianceProfile.deleteMany({}),
      AiMaterialityPolicy.deleteMany({}), AiEvidencePack.deleteMany({}), AiAttentionItem.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-18 and persists a real evidence pack", async () => {
    await Organization.create({ name: "AI18 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAcc = await makeAccount(TENANT, "liability_payable", "liability", "AP Control Trigger");
    const bill = await Invoice.create({
      tenantId: TENANT, name: `BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted",
      invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"),
      invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }],
      amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid",
    });
    await JournalEntry.create({
      tenantId: TENANT, header: { name: "JE-trigger", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted",
      lineIds: [
        { accountId: controlAcc, label: "line", debit: 100, credit: 0, sourceId: bill._id },
        { accountId: controlAcc, label: "line", debit: 0, credit: 100 },
      ],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    });
    await seedAi14Comparison(TENANT, String(controlAcc), "material");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-18", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-18" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached event that reached AI-18").not.toBeNull();
    const pack = await AiEvidencePack.findOne({ tenantId: TENANT }).lean();
    expect(pack, "the real sweep must have persisted a real AiEvidencePack").not.toBeNull();
  });

  // ── Section 9 bug regression: unvalidated period.horizon.reached payload (known defect class 2) ──
  it("bug regression: a missing or malformed period.horizon.reached payload degrades to the current period instead of crashing", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-18", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const badPayloads: Record<string, unknown>[] = [
      {},
      { period: "undefined" },
      { period: "not-a-period" },
      { period: "2026-13" },
      { period: "2026" },
      { period: "" },
      { period: PERIOD, periodEnd: "garbage" },
      { period: 12345 },
      { period: null },
    ];
    for (const payload of badPayloads) {
      const envelope = await runWorkflow(ai18AuditEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload });
      expect(envelope.status, `payload ${JSON.stringify(payload)} must not fail the run`).not.toBe("failed");
    }
  });

  it("bug regression (direct reproduction): a malformed period never reaches annotateStatement()'s Date logic as an Invalid Date", async () => {
    // observe()'s own validated-period derivation is what's under test — confirms periodEnd is
    // always DERIVED from the validated period, never trusted from a separately-supplied string
    // (the real cron trigger's own payload shape, {period, periodEnd}, is exactly what a hostile
    // or buggy caller could otherwise desync).
    const observed = await ai18AuditEvidence.observe({ tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "garbage", periodEnd: "also-garbage" } });
    expect(observed.raw.period).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(Number.isNaN(new Date(observed.raw.periodEnd).getTime())).toBe(false);
  });

  // ── C.4 Cross-tenant (positive proof) — known defect class 1 ──────────────────────────────
  // AI-18's observe() takes only event.payload.period/periodEnd (strings, never an externally-
  // supplied record id) and extract()/act() only ever resolve accounts via annotateStatement()
  // (itself scoped to ctx.tenantId throughout) and the real build_evidence_pack/traceAccountEvidence
  // calls (also tenantId-scoped) — there is no subject-record id anywhere in this workflow's own
  // input for the AI-01..04/07-10 unscoped-findById defect shape to attach to. Confirmed by
  // reading, and proven here with real, differing data on both tenants.
  it("C.4 cross-tenant: tenant A's evidence pack and findings never include tenant B's accounts, even with a hostile actingUserId from tenant B", async () => {
    const vendorA = await Customer.create({ tenantId: TENANT, header: { name: "Vendor A", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAccA = await makeAccount(TENANT, "liability_payable", "liability", "AP Control A");
    const billA = await Invoice.create({ tenantId: TENANT, name: `BILL-A-${Date.now()}`, partnerId: vendorA._id, moveType: "in_invoice", state: "posted", invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"), invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }], amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid" });
    await JournalEntry.create({ tenantId: TENANT, header: { name: "JE-A", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted", lineIds: [{ accountId: controlAccA, label: "line", debit: 100, credit: 0, sourceId: billA._id }, { accountId: controlAccA, label: "line", debit: 0, credit: 100 }], totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 } });
    await seedAi14Comparison(TENANT, String(controlAccA), "material");

    const vendorB = await Customer.create({ tenantId: OTHER_TENANT, header: { name: "Vendor B", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAccB = await makeAccount(OTHER_TENANT, "liability_payable", "liability", "AP Control B");
    const billB = await Invoice.create({ tenantId: OTHER_TENANT, name: `BILL-B-${Date.now()}`, partnerId: vendorB._id, moveType: "in_invoice", state: "posted", invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"), invoiceLines: [{ name: "Goods", priceSubtotal: 999999, quantity: 1, priceUnit: 999999 }], amountUntaxed: 999999, amountTax: 0, amountTotal: 999999, amountResidual: 999999, paymentState: "not_paid" });
    await JournalEntry.create({ tenantId: OTHER_TENANT, header: { name: "JE-B", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted", lineIds: [{ accountId: controlAccB, label: "line", debit: 999999, credit: 0, sourceId: billB._id }, { accountId: controlAccB, label: "line", debit: 0, credit: 999999 }], totals: { amountUntaxed: 999999, amountTax: 0, amountTotal: 999999 } });
    await seedAi14Comparison(OTHER_TENANT, String(controlAccB), "material");

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-18", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai18AuditEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodEnd: PERIOD_END.toISOString(), actingUserId: String(new mongoose.Types.ObjectId()) } });
    expect(envelope.findings.every((f) => !f.title.includes("AP Control B"))).toBe(true);

    const packA = await AiEvidencePack.findOne({ tenantId: TENANT }).lean();
    const accountRefsA = JSON.stringify(packA?.figures ?? []) + JSON.stringify(packA?.missingEvidence ?? []);
    expect(accountRefsA.includes(String(controlAccB))).toBe(false);
    const packB = await AiEvidencePack.findOne({ tenantId: OTHER_TENANT }).lean();
    expect(packB).toBeNull(); // AI-18 was never run for tenant B here — proves no cross-write either.
  });

  // ── C.4 Kill switch off ─────────────────────────────────────────────────────────────────────
  // Same reasoning confirmed for AI-29/AI-17: AI-18 declares defaultAutonomy: OBSERVE, so
  // autonomyGate.ts's OBSERVE/RECOMMEND short-circuit (already tested in autonomyGate.test.ts)
  // never consults kill_switch_enabled, and eventBus.ts's dispatch-level requiresValidation gate
  // only fires above RECOMMEND. AI-18's own writes (`record_evidence_pack`) are `internal_state`
  // (lib/aiRuntime/tools/auditTools.ts) — an internal evidence-pack record, not a business
  // document. Confirmed directly, not assumed: the kill switch has nothing to gate here.
  it("C.4 kill switch off: OBSERVE-ceiling AI-18 still sweeps and persists its internal evidence pack — the kill switch gates autonomy elevation beyond OBSERVE/RECOMMEND, not internal_state writes", async () => {
    const vendor = await Customer.create({ tenantId: TENANT, header: { name: "Vendor Co", is_company: true }, createdBy: new mongoose.Types.ObjectId() });
    const controlAcc = await makeAccount(TENANT, "liability_payable", "liability", "AP Control Killswitch");
    const bill = await Invoice.create({ tenantId: TENANT, name: `BILL-${Date.now()}`, partnerId: vendor._id, moveType: "in_invoice", state: "posted", invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-01-10"), invoiceLines: [{ name: "Goods", priceSubtotal: 1000, quantity: 1, priceUnit: 1000 }], amountUntaxed: 1000, amountTax: 0, amountTotal: 1000, amountResidual: 1000, paymentState: "not_paid" });
    await JournalEntry.create({ tenantId: TENANT, header: { name: "JE-ks", date: new Date("2026-01-10"), journalType: "purchase" }, status: "posted", voucherStatus: "posted", lineIds: [{ accountId: controlAcc, label: "line", debit: 100, credit: 0, sourceId: bill._id }, { accountId: controlAcc, label: "line", debit: 0, credit: 100 }], totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 } });
    await seedAi14Comparison(TENANT, String(controlAcc), "material");
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-18", killSwitchEnabled: false, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai18AuditEvidence, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodEnd: PERIOD_END.toISOString() } });
    expect(envelope.status).not.toBe("failed");
    const pack = await AiEvidencePack.findOne({ tenantId: TENANT }).lean();
    expect(pack, "the evidence sweep is internal_state and must still run with the kill switch off").not.toBeNull();
  });

  // ── Section 9 bug regression: MAX_ACCOUNTS_PER_SWEEP's own completenessScore fix ───────────
  // Documented directly in the workflow's own source (index.ts): before this fix,
  // completenessScore was `1 - missingEvidenceCount / checkedCount` — computed only over the
  // accounts the 20-account cap actually let through. A tenant with 25 unsupported-material
  // accounts where the first 20 evidenced cleanly reported completenessScore: 1 (fully complete)
  // while 5 known-unsupported accounts were silently never evidenced this run — a confidently
  // wrong "fully evidenced" signal. This is the regression test the source comment cites but that
  // never existed until now — verified directly against the real act(), not trusted from the diff.
  it("bug regression: with more swept accounts than MAX_ACCOUNTS_PER_SWEEP (20), completenessScore counts every unchecked account as incomplete and states how many were skipped", async () => {
    const accounts: { accountId: string; accountName: string }[] = [];
    for (let i = 0; i < 25; i++) {
      const id = await makeAccount(TENANT, "liability_payable", "liability", `Swept Account ${i}`);
      accounts.push({ accountId: String(id), accountName: `Swept Account ${i}` });
    }

    const { actResult, proposal } = await runActDirectly(TENANT, accounts);

    expect(proposal.accountPacks).toHaveLength(20); // the cap — only the first 20 got a real evidence pack built
    // The bug: completenessScore used to be scored only over checkedCount (20), so 0
    // missingEvidence among those 20 => a false 1.0 ("fully complete"), silently ignoring the 5
    // accounts never checked at all. The fix scores against the TOTAL swept population (25) and
    // treats every unchecked account as incomplete.
    const expectedScore = Math.max(0, 1 - (0 + 5) / 25); // 0 missingEvidence found among the 20 checked (no bills seeded) + 5 unchecked, over 25 total
    expect(proposal.completenessScore).toBeCloseTo(expectedScore, 6);
    expect(proposal.completenessScore).toBeLessThan(1); // never a false "fully complete"

    const skippedFinding = actResult.findings.find((f) => f.title.includes("not yet evidenced"));
    expect(skippedFinding, "the skipped accounts must be a stated finding, never silent").toBeDefined();
    expect(skippedFinding!.detail).toContain("25 account(s)");
    expect(skippedFinding!.detail).toContain("first 20");
    expect(skippedFinding!.subjectRefs).toHaveLength(5); // the 5 skipped accounts, named
  });

  it("false-positive check: exactly MAX_ACCOUNTS_PER_SWEEP (20) swept accounts — nothing is skipped, no false 'not yet evidenced' finding", async () => {
    const accounts: { accountId: string; accountName: string }[] = [];
    for (let i = 0; i < 20; i++) {
      const id = await makeAccount(TENANT, "liability_payable", "liability", `Swept Account ${i}`);
      accounts.push({ accountId: String(id), accountName: `Swept Account ${i}` });
    }

    const { actResult, proposal } = await runActDirectly(TENANT, accounts);
    expect(proposal.accountPacks).toHaveLength(20);
    const skippedFinding = actResult.findings.find((f) => f.title.includes("not yet evidenced"));
    expect(skippedFinding).toBeUndefined(); // exactly at the cap, not over it — nothing skipped
  });

  // ── C.1 Empty ────────────────────────────────────────────────────────────────────────────────
  it("C.1 empty: zero unsupported-material accounts this period → a clean sweep, completenessScore 1, never a vacuous exception", async () => {
    const { actResult, proposal } = await runActDirectly(TENANT, []);
    expect(actResult.findings).toEqual([]);
    expect(proposal.completenessScore).toBe(1);
    expect(proposal.accountPacks).toEqual([]);
  });
});

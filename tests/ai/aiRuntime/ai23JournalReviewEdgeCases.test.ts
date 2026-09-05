import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai23edge";
process.env.CRON_SECRET = "ai23-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountingSettings from "@/models/finance/AccountingSettings";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiSchedule from "@/models/ai/AiSchedule";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai23JournalReview: typeof import("@/lib/aiRuntime/workflows/ai-23-journal-review").ai23JournalReview;
let registerTool: typeof import("@/lib/aiRuntime/tools/registry").registerTool;
let getTool: typeof import("@/lib/aiRuntime/tools/registry").getTool;
let registerJournalReviewTools: typeof import("@/lib/aiRuntime/tools/journalReviewTools").registerJournalReviewTools;

const TENANT = "ai23-edge-tenant";
const OTHER_TENANT = "ai23-edge-other-tenant";

async function makeAccount(tenantId: string, account_type: string, internal_group: string, name: string) {
  const acc = await Account.create({ tenantId, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

/** Posts a journal, then force-sets createdAt (Mongoose's timestamps plugin overrides any
 *  createdAt passed to .create() — the fix already established in ai23JournalReview.test.ts). */
async function postJournal(tenantId: string, opts: {
  name: string; date: Date; createdAt: Date; journalType?: string; createdBy?: mongoose.Types.ObjectId;
  lines: { accountId: mongoose.Types.ObjectId; debit: number; credit: number; label?: string }[];
}) {
  const entry = await JournalEntry.create({
    tenantId,
    header: { name: opts.name, date: opts.date, journalType: opts.journalType ?? "general" },
    status: "posted",
    voucherStatus: "posted",
    createdBy: opts.createdBy,
    lineIds: opts.lines.map((l) => ({ accountId: l.accountId, label: l.label ?? "", debit: l.debit, credit: l.credit })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: opts.lines.reduce((s, l) => s + l.debit, 0) },
  });
  await JournalEntry.collection.updateOne({ _id: entry._id }, { $set: { createdAt: opts.createdAt } });
  return entry;
}

async function runAi23(tenantId: string, period: string, periodStartIso: string, periodEndIso: string) {
  return runWorkflow(ai23JournalReview, { tenantId, eventKey: "period.horizon.reached", payload: { period, periodStart: periodStartIso, periodEnd: periodEndIso } });
}

describe("AI-23 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), JournalEntry.init(), AccountingSettings.init(), User.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(), AiSchedule.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai23JournalReview } = await import("@/lib/aiRuntime/workflows/ai-23-journal-review"));
    ({ registerTool, getTool } = await import("@/lib/aiRuntime/tools/registry"));
    ({ registerJournalReviewTools } = await import("@/lib/aiRuntime/tools/journalReviewTools"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}), AccountingSettings.deleteMany({}), User.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiSchedule.deleteMany({}),
    ]);
    registerJournalReviewTools(); // restore the real tool in case a test swapped it out
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-23 and raises a real escalation finding", async () => {
    await Organization.create({ name: "AI23 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const revenue = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const suspense = await makeAccount(TENANT, "asset_current", "asset", "Suspense");
    const now = new Date();
    // Weekend or not, a manual entry with no description straight to a sensitive account is a
    // guaranteed escalate regardless of what day the sweep actually runs.
    await postJournal(TENANT, { name: "JE-real-trigger", date: now, createdAt: now, journalType: "general", lines: [{ accountId: suspense, debit: 5000, credit: 0 }, { accountId: revenue, debit: 0, credit: 5000 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-23" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached event that reached AI-23").not.toBeNull();
    expect((run as unknown as { findings: unknown[] }).findings.length).toBeGreaterThan(0);
  });

  // ── Section 9 bug regression: same defect class fixed in AI-14/AI-25/AI-28/AI-22 ──────────
  it("bug regression: missing/malformed period, periodStart, periodEnd all degrade to the current month instead of crashing", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const badValues = [undefined, "not-a-date", "", "2026-13-40", "NaN"];
    for (const bad of badValues) {
      const payload: Record<string, unknown> = {};
      if (bad !== undefined) {
        payload.period = bad;
        payload.periodStart = bad;
        payload.periodEnd = bad;
      }
      const envelope = await runWorkflow(ai23JournalReview, { tenantId: TENANT, eventKey: "period.horizon.reached", payload });
      expect(envelope.status, `payload=${JSON.stringify(payload)} must not fail the run`).not.toBe("failed");
    }
  });

  // ── C.4 Cross-tenant (positive proof) ──────────────────────────────────────────────────────
  // AI-23's event payload carries only `period`/`periodStart`/`periodEnd` (never a subject-record
  // id) — extract() scopes its JournalEntry query with `tenantId: ctx.tenantId` directly (never
  // from the payload), and act()'s tool call passes `entryId` values that came only from that same
  // tenant-scoped query, never from the payload. No externally-supplied record id exists anywhere
  // in this workflow's input for the earlier-found unscoped-findById class to attach to. Confirmed
  // with a positive-proof test: tenant B's journals never appear in tenant A's run, and a hostile
  // tenantId embedded in the payload is ignored entirely (observe() never reads it).
  it("C.4 cross-tenant: tenant A's run never scores tenant B's journals, even with a hostile tenantId embedded in the payload", async () => {
    const revenueA = await makeAccount(TENANT, "income", "income", "Revenue A");
    const suspenseA = await makeAccount(TENANT, "asset_current", "asset", "Suspense A");
    const revenueB = await makeAccount(OTHER_TENANT, "income", "income", "Revenue B");
    const suspenseB = await makeAccount(OTHER_TENANT, "asset_current", "asset", "Suspense B");
    await postJournal(TENANT, { name: "JE-A", date: new Date("2026-02-03T15:00:00Z"), createdAt: new Date("2026-02-03T15:00:00Z"), lines: [{ accountId: suspenseA, debit: 100, credit: 0 }, { accountId: revenueA, debit: 0, credit: 100 }] });
    await postJournal(OTHER_TENANT, { name: "JE-B-HOSTILE", date: new Date("2026-02-03T15:00:00Z"), createdAt: new Date("2026-02-03T15:00:00Z"), lines: [{ accountId: suspenseB, debit: 9_000_000, credit: 0 }, { accountId: revenueB, debit: 0, credit: 9_000_000 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runWorkflow(ai23JournalReview, {
      tenantId: TENANT,
      eventKey: "period.horizon.reached",
      payload: { period: "2026-02", periodStart: new Date("2026-02-01").toISOString(), periodEnd: new Date("2026-02-28T23:59:59Z").toISOString(), tenantId: OTHER_TENANT },
    });

    expect(envelope.findings.some((f) => f.title.includes("JE-B-HOSTILE"))).toBe(false);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { scanned: number };
    expect(proposal.scanned).toBe(1); // only tenant A's own journal
  });

  // ── C.1 Empty ───────────────────────────────────────────────────────────────────────────────
  it("C.1 empty: zero posted journals in the period → clean no_action, never an error", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const envelope = await runAi23(TENANT, "2026-02", new Date("2026-02-01").toISOString(), new Date("2026-02-28T23:59:59Z").toISOString());
    expect(envelope.status).toBe("no_action");
    expect(envelope.findings).toHaveLength(0);
  });

  // ── C.2 Boundary: period start/end are inclusive on the correct sides ─────────────────────
  it("C.2 period boundary: a journal at 23:59:59.999 on the last day is included; the first instant of the next period is excluded", async () => {
    const revenue = await makeAccount(TENANT, "income", "income", "Revenue");
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    await postJournal(TENANT, { name: "JE-last-instant", date: new Date("2026-02-28T23:59:59.999Z"), createdAt: new Date("2026-02-28T23:59:59.999Z"), journalType: "sale", lines: [{ accountId: cash, debit: 100, credit: 0, label: "in period" }, { accountId: revenue, debit: 0, credit: 100, label: "in period" }] });
    await postJournal(TENANT, { name: "JE-first-instant-next", date: new Date("2026-03-01T00:00:00.000Z"), createdAt: new Date("2026-03-01T00:00:00.000Z"), journalType: "sale", lines: [{ accountId: cash, debit: 100, credit: 0, label: "next period" }, { accountId: revenue, debit: 0, credit: 100, label: "next period" }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runAi23(TENANT, "2026-02", new Date("2026-02-01T00:00:00Z").toISOString(), new Date("2026-02-28T23:59:59.999Z").toISOString());
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { scanned: number };
    expect(proposal.scanned).toBe(1); // only the last-instant journal, not the next-period one
  });

  // ── C.1/C.2 Large volume + the per-run truncation cap boundary ────────────────────────────
  it("C.1 large volume: 350 posted journals in one period are correctly detected as truncated at the 300-cap boundary, within budget", async () => {
    const revenue = await makeAccount(TENANT, "income", "income", "Revenue");
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    const docs = Array.from({ length: 350 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `BULK-JE-${i}`, date: new Date("2026-02-15T12:00:00Z"), journalType: "sale" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: cash, label: "Cash sale receipt", debit: 100, credit: 0 },
        { accountId: revenue, label: "Cash sale receipt", debit: 0, credit: 100 },
      ],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    }));
    await JournalEntry.insertMany(docs);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const start = Date.now();
    const envelope = await runAi23(TENANT, "2026-02", new Date("2026-02-01").toISOString(), new Date("2026-02-28T23:59:59Z").toISOString());
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-23 large-volume run (350 journals, 300-cap): ${elapsedMs}ms`);

    expect(envelope.status).not.toBe("failed");
    const truncatedFinding = envelope.findings.find((f) => f.title.includes("more than 300 journals"));
    expect(truncatedFinding, "the 300-cap truncation must be a visible finding, not a silent drop").toBeDefined();
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { scanned: number };
    expect(proposal.scanned).toBe(300); // capped, but DETECTABLY so (the finding above)
    expect(elapsedMs).toBeLessThan(30000); // generous dev-box ceiling (docs/ai/UI_REGRESSION.md)
  }, 60000);

  // ── C.3 Duplicate event (documented, unfixed executor race — same class as AI-28/AI-22) ───
  it("C.3 duplicate event (documented, unfixed executor race, same class as AI-28's verification record): concurrent identical events — no duplicate effect", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });
    const eventId = new mongoose.Types.ObjectId().toString();
    const event = { id: eventId, tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-02", periodStart: new Date("2026-02-01").toISOString(), periodEnd: new Date("2026-02-28T23:59:59Z").toISOString() } };

    const results = await Promise.allSettled([runWorkflow(ai23JournalReview, event), runWorkflow(ai23JournalReview, event)]);
    expect(results.filter((r) => r.status === "fulfilled").length + results.filter((r) => r.status === "rejected").length).toBe(2);
    const runs = await AiWorkflowRun.find({ workflowId: "AI-23", triggerEventId: eventId }).lean();
    expect(runs).toHaveLength(1); // no duplicate EFFECT, even though one call may currently error
  });

  // ── C.5 Tool failure mid-run ────────────────────────────────────────────────────────────────
  it("C.5 tool failure: score_journal_risk throwing mid-run fails the run cleanly, with no partial findings persisted", async () => {
    const revenue = await makeAccount(TENANT, "income", "income", "Revenue");
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    await postJournal(TENANT, { name: "JE-tool-fail", date: new Date("2026-02-10T12:00:00Z"), createdAt: new Date("2026-02-10T12:00:00Z"), journalType: "sale", lines: [{ accountId: cash, debit: 500, credit: 0, label: "x" }, { accountId: revenue, debit: 0, credit: 500, label: "x" }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const original = getTool("score_journal_risk")!;
    registerTool({ ...original, handler: async () => { throw new Error("simulated tool failure"); } });
    try {
      const eventId = new mongoose.Types.ObjectId().toString();
      await expect(
        runWorkflow(ai23JournalReview, { id: eventId, tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: "2026-02", periodStart: new Date("2026-02-01").toISOString(), periodEnd: new Date("2026-02-28T23:59:59Z").toISOString() } }),
      ).rejects.toThrow("simulated tool failure");

      const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-23", triggerEventId: eventId }).lean();
      expect(run).not.toBeNull();
      expect(run!.status).toBe("failed");
      expect(run!.findings ?? []).toHaveLength(0); // no partial write of findings survives a mid-act failure
    } finally {
      registerTool(original);
    }
  });

  // ── C.6 Adversarial pass ────────────────────────────────────────────────────────────────────
  // What input makes AI-23 produce a confidently-wrong "auto_ok" a human would accept? Both the
  // "unusual_account_combination" and "rare_poster" dimensions (scoreJournalRisk.ts) are gated
  // behind `input.baseline.totalPostedJournals >= 10` — deliberately, to avoid flagging every
  // single journal a brand-new tenant posts as "unusual" purely for lack of history. But that
  // same guard means a tenant with FEWER than 10 total historical journals gets a complete pass
  // on BOTH detectors for its very first large, first-time-combination, first-time-poster entry —
  // regardless of how anomalous it actually is. A weekday, business-hours, described entry with no
  // SoD conflict and no threshold proximity sails through as auto_ok. This is a genuine, verified
  // limitation (not fixed in this pass — the threshold trades sensitivity for specificity on thin
  // tenants, and raising it isn't a decision this pass should make unilaterally), not a coding bug.
  it("C.6 adversarial: a thin-history tenant's first large, first-time-combination journal by a first-time poster scores auto_ok", async () => {
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    const revenue = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const newUser = new mongoose.Types.ObjectId();
    // Only 5 baseline journals — under the totalPostedJournals >= 10 gate for BOTH
    // unusual_account_combination and rare_poster.
    for (let i = 0; i < 5; i++) {
      await postJournal(TENANT, { name: `JE-thin-${i}`, date: new Date(`2025-12-0${i + 1}T12:00:00Z`), createdAt: new Date(`2025-12-0${i + 1}T12:00:00Z`), journalType: "sale", lines: [{ accountId: cash, debit: 100, credit: 0, label: "Cash sale" }, { accountId: revenue, debit: 0, credit: 100, label: "Cash sale" }] });
    }
    // A brand-new, non-sensitive account combination the tenant has never used, by a brand-new
    // poster, for a large amount — weekday, business hours, has a description, no SoD conflict.
    const newExpenseAccount = await makeAccount(TENANT, "expense", "expense", "Consulting Fees");
    const target = await postJournal(TENANT, {
      name: "JE-thin-history-large", date: new Date("2026-01-14T12:00:00Z"), createdAt: new Date("2026-01-14T12:00:00Z"), journalType: "purchase", createdBy: newUser,
      lines: [{ accountId: newExpenseAccount, debit: 250000, credit: 0, label: "Large consulting engagement fee" }, { accountId: cash, debit: 0, credit: 250000, label: "Large consulting engagement fee" }],
    });

    const { buildAndScoreJournalRisk } = await import("@/lib/aiRuntime/journalReview/buildRiskInput");
    const result = await buildAndScoreJournalRisk(TENANT, String(target._id));
    // Documents CURRENT, confirmed behaviour: auto_ok despite a never-before-seen account
    // combination, a first-time poster, and an amount 2,500x this tenant's own baseline —
    // exactly the adversarial case this test proves exists, not asserts as correct.
    expect(result!.recommendation).toBe("auto_ok");
    expect(result!.flags.some((f) => f.dimension === "unusual_account_combination")).toBe(false);
    expect(result!.flags.some((f) => f.dimension === "rare_poster")).toBe(false);
  });
});

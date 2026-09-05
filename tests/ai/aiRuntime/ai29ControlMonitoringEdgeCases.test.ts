import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai29edge";
process.env.CRON_SECRET = "ai29-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountingSettings from "@/models/finance/AccountingSettings";
import AiControlResult from "@/models/ai/AiControlResult";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AiHold from "@/models/ai/AiHold";
import AiMasterDataProfile from "@/models/ai/AiMasterDataProfile";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai29ControlMonitoring: typeof import("@/lib/aiRuntime/workflows/ai-29-control-monitoring").ai29ControlMonitoring;
let runAllControlDefinitions: typeof import("@/lib/aiRuntime/controls/engine").runAllControlDefinitions;
let CONTROL_DEFINITIONS: typeof import("@/lib/aiRuntime/controls/definitions").CONTROL_DEFINITIONS;

const TENANT = "ai29-edge-tenant";
const OTHER_TENANT = "ai29-edge-other-tenant";
const PERIOD = "2026-01";

async function makeAccount(tenantId: string, account_type: string, internal_group: string, name: string) {
  const acc = await Account.create({ tenantId, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

async function postJournal(tenantId: string, opts: { name: string; date: Date; lines: { accountId: mongoose.Types.ObjectId; debit: number; credit: number }[] }) {
  return JournalEntry.create({
    tenantId,
    header: { name: opts.name, date: opts.date, journalType: "general" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: opts.lines.map((l) => ({ accountId: l.accountId, label: "line", debit: l.debit, credit: l.credit })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: opts.lines.reduce((s, l) => s + l.debit, 0) },
  });
}

describe("AI-29 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), JournalEntry.init(), AccountingSettings.init(),
      AiControlResult.init(), AiAttentionItem.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(),
      AiWorkflowPolicy.init(), AiHold.init(), AiMasterDataProfile.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai29ControlMonitoring } = await import("@/lib/aiRuntime/workflows/ai-29-control-monitoring"));
    ({ runAllControlDefinitions } = await import("@/lib/aiRuntime/controls/engine"));
    ({ CONTROL_DEFINITIONS } = await import("@/lib/aiRuntime/controls/definitions"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}), AccountingSettings.deleteMany({}),
      AiControlResult.deleteMany({}), AiAttentionItem.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}), AiHold.deleteMany({}), AiMasterDataProfile.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route ──────────────────────────────────
  it("trigger proof: the real cron sweep route fires AI-29 and records a real control result", async () => {
    await Organization.create({ name: "AI29 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    const equity = await makeAccount(TENANT, "equity", "equity", "Equity");
    // A non-standard-override with no stated reason inside the CURRENT calendar month — the real
    // cron always fires period.horizon.reached for "now", so this must land in-period regardless
    // of when this test runs.
    await postJournal(TENANT, { name: "JE-override-noreason", date: new Date(), lines: [{ accountId: cash, debit: 100, credit: 0 }, { accountId: equity, debit: 0, credit: 100 }] });
    await JournalEntry.updateOne({ tenantId: TENANT, "header.name": "JE-override-noreason" }, { $set: { semanticOverride: { applied: true } } });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-29", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-29" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real period.horizon.reached event that reached AI-29").not.toBeNull();
    const result = await AiControlResult.findOne({ tenantId: TENANT, controlId: "override_logged" }).lean();
    expect(result).not.toBeNull();
    expect(result!.exceptions.some((e: any) => e.detail.includes("JE-override-noreason"))).toBe(true);
  });

  // ── Section 9 bug regression: same defect class fixed in AI-14/AI-25 ──────────────────────
  it("bug regression: a missing or malformed period.horizon.reached payload degrades to the current period instead of crashing", async () => {
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-29", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const badPayloads: Record<string, unknown>[] = [
      {},
      { period: "undefined" },
      { period: "not-a-period" },
      { period: "2026-13" },
      { period: "2026" },
      { period: "" },
      { period: PERIOD, periodStart: "garbage", periodEnd: "also-garbage" },
      { period: 12345 },
    ];
    for (const payload of badPayloads) {
      const envelope = await runWorkflow(ai29ControlMonitoring, { tenantId: TENANT, eventKey: "period.horizon.reached", payload });
      expect(envelope.status, `payload ${JSON.stringify(payload)} must not fail the run`).not.toBe("failed");
    }
  });

  // ── C.4 Cross-tenant (positive proof) ──────────────────────────────────────────────────────
  it("C.4 cross-tenant: tenant A's control results never include tenant B's exceptions, even though B has real violations", async () => {
    const cashA = await makeAccount(TENANT, "asset_cash", "asset", "Cash A");
    const expenseA = await makeAccount(TENANT, "expense", "expense", "Expense A");
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 1000 } });
    await postJournal(TENANT, { name: "JE-clean-A", date: new Date("2026-01-10"), lines: [{ accountId: expenseA, debit: 50, credit: 0 }, { accountId: cashA, debit: 0, credit: 50 }] });

    const cashB = await makeAccount(OTHER_TENANT, "asset_cash", "asset", "Cash B");
    const expenseB = await makeAccount(OTHER_TENANT, "expense", "expense", "Expense B");
    await AccountingSettings.create({ tenantId: OTHER_TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 10 } });
    await postJournal(OTHER_TENANT, { name: "JE-violation-B", date: new Date("2026-01-10"), lines: [{ accountId: expenseB, debit: 5000, credit: 0 }, { accountId: cashB, debit: 0, credit: 5000 }] });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-29", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runWorkflow(ai29ControlMonitoring, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T23:59:59.999Z" } });
    expect(envelope.findings.length).toBe(0);

    const resultsA = await AiControlResult.find({ tenantId: TENANT }).lean();
    for (const r of resultsA) expect(r.exceptions.some((e: any) => e.detail.includes("JE-violation-B"))).toBe(false);
    const resultsB = await AiControlResult.find({ tenantId: OTHER_TENANT }).lean();
    expect(resultsB).toEqual([]); // AI-29 was never run for tenant B in this test — proves no cross-write either.
  });

  // ── C.3 concurrent duplicate event: period.horizon.reached fired twice "simultaneously" ───
  it("concurrent duplicate period.horizon.reached dispatch → exactly one AiControlResult and one AiAttentionItem per control, not two", async () => {
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    const expense = await makeAccount(TENANT, "expense", "expense", "Expense");
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 100 } });
    await postJournal(TENANT, { name: "JE-concurrent", date: new Date("2026-01-10"), lines: [{ accountId: expense, debit: 500, credit: 0 }, { accountId: cash, debit: 0, credit: 500 }] });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-29", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const event = { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T23:59:59.999Z" } };
    await Promise.all([
      runWorkflow(ai29ControlMonitoring, { ...event, id: undefined }),
      runWorkflow(ai29ControlMonitoring, { ...event, id: undefined }),
    ]);

    const results = await AiControlResult.find({ tenantId: TENANT, controlId: "approval_present", period: PERIOD }).lean();
    expect(results).toHaveLength(1); // upserted on {tenantId, controlId, period}, not duplicated
    const items = await AiAttentionItem.find({ tenantId: TENANT, workflowId: "AI-29", dedupeKey: { $regex: "approval_present" } }).lean();
    console.log("DEBUG dedupeKeys:", items.map((i) => i.dedupeKey));
    const indexes = await AiAttentionItem.collection.indexes();
    console.log("DEBUG indexes:", JSON.stringify(indexes));
    expect(items).toHaveLength(1); // upserted on dedupeKey, not duplicated
  });

  // ── C.1 Large volume ───────────────────────────────────────────────────────────────────────
  it("C.1 large volume: 10,000 posted journal entries across the period's controls resolve correctly within budget", async () => {
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    const expense = await makeAccount(TENANT, "expense", "expense", "Expense");
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 1_000_000 } }); // threshold high enough that none of these trip approval_present
    const docs = Array.from({ length: 10000 }, (_, i) => ({
      tenantId: TENANT,
      header: { name: `BULK-JE-${i}`, date: new Date("2026-01-15"), journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: expense, label: "line", debit: 100, credit: 0 },
        { accountId: cash, label: "line", debit: 0, credit: 100 },
      ],
      totals: { amountUntaxed: 100, amountTax: 0, amountTotal: 100 },
    }));
    await JournalEntry.insertMany(docs);
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-29", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runWorkflow(ai29ControlMonitoring, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T23:59:59.999Z" } });
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-29 large-volume control sweep (10,000 posted journal entries): ${elapsedMs}ms`);

    expect(envelope.status).not.toBe("failed");
    const approvalResult = await AiControlResult.findOne({ tenantId: TENANT, controlId: "approval_present", period: PERIOD }).lean();
    expect(approvalResult!.populationSize).toBe(10000);
    expect(approvalResult!.exceptions).toEqual([]); // false-positive check: nothing trips at this threshold
    // Generous ceiling per docs/ai/BRIEF-09-VERIFICATION.md Part E.3 / UI_REGRESSION.md — this is
    // a shared dev machine; the point is "doesn't hang", not a tight SLA.
    expect(elapsedMs).toBeLessThan(35000);
  }, 40000);

  // ── C.6 Adversarial pass ────────────────────────────────────────────────────────────────────
  // What input makes AI-29 report a confidently wrong "pass" a human would accept? override_logged
  // only checks that semanticOverride.reason is a non-empty string (lib/aiRuntime/controls/
  // definitions.ts's own doc comment: "no reviewed field exists to check 'and reviewed' against").
  // A placeholder reason like "na" or "." satisfies that shape check and reports the control as
  // PASSED, exactly as if a real business justification had been recorded — a reviewer trusting
  // overall_control_health would never know. This is a documented, deliberate scope boundary (the
  // alternative is guessing text quality, the same class of heuristic this project avoids for
  // sod_permission_conflict/access_change_authorised), not a defect to silently patch with a guess
  // — recorded here so the limitation is explicit, not silently discovered by a customer's auditor.
  it("C.6 adversarial: a placeholder override reason ('na') passes override_logged exactly like a genuine justification (documented limitation, not a silent gap)", async () => {
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    const equity = await makeAccount(TENANT, "equity", "equity", "Equity");
    await postJournal(TENANT, { name: "JE-placeholder-reason", date: new Date("2026-01-10"), lines: [{ accountId: cash, debit: 100, credit: 0 }, { accountId: equity, debit: 0, credit: 100 }] });
    await JournalEntry.updateOne({ tenantId: TENANT, "header.name": "JE-placeholder-reason" }, { $set: { semanticOverride: { applied: true, reason: "na" } } });

    const results = await runAllControlDefinitions(TENANT, CONTROL_DEFINITIONS, new Date("2026-01-01"), new Date("2026-01-31T23:59:59.999Z"));
    const control = results.find((r) => r.controlId === "override_logged")!;
    expect(control.exceptions).toEqual([]); // confirms the current (documented) shape-only check — no false alarm, but no real assurance either
  });

  // ── C.4 Kill switch off ─────────────────────────────────────────────────────────────────────
  it("C.4 kill switch off: no AiControlResult or AiAttentionItem is written, run escalates/no-actions cleanly", async () => {
    const cash = await makeAccount(TENANT, "asset_cash", "asset", "Cash");
    const expense = await makeAccount(TENANT, "expense", "expense", "Expense");
    const sameUser = new mongoose.Types.ObjectId();
    await postJournal(TENANT, { name: "JE-killswitch", date: new Date("2026-01-10"), lines: [{ accountId: expense, debit: 500, credit: 0 }, { accountId: cash, debit: 0, credit: 500 }] });
    await JournalEntry.updateOne({ tenantId: TENANT, "header.name": "JE-killswitch" }, { $set: { createdBy: sameUser, approvalDetails: { approvedBy: sameUser } } });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-29", killSwitchEnabled: false, maxAutonomyLevel: "observe" });

    const envelope = await runWorkflow(ai29ControlMonitoring, { tenantId: TENANT, eventKey: "period.horizon.reached", payload: { period: PERIOD, periodStart: "2026-01-01T00:00:00.000Z", periodEnd: "2026-01-31T23:59:59.999Z" } });
    expect(envelope.status).not.toBe("failed");
    expect(envelope.status).not.toBe("completed"); // never a write with the switch off
    const results = await AiControlResult.find({ tenantId: TENANT }).lean();
    expect(results).toEqual([]);
    const items = await AiAttentionItem.find({ tenantId: TENANT, workflowId: "AI-29" }).lean();
    expect(items).toEqual([]);
  });
});

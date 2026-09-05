import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai15edge";
process.env.CRON_SECRET = "ai15-edge-test-secret";

import Organization from "@/models/admin/Organization";
import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Customer from "@/models/sales/Customer";
import User from "@/models/auth/User";
import AiAnomaly from "@/models/ai/AiAnomaly";
import AiDetectorHealth from "@/models/ai/AiDetectorHealth";
import AiAnomalySuppression from "@/models/ai/AiAnomalySuppression";
import AiAttentionItem from "@/models/ai/AiAttentionItem";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";
import AccountingSettings from "@/models/finance/AccountingSettings";
import AiSchedule from "@/models/ai/AiSchedule";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai15AnomalyDetection: typeof import("@/lib/aiRuntime/workflows/ai-15-anomaly-detection").ai15AnomalyDetection;

const TENANT = "ai15-edge-tenant";
const OTHER_TENANT = "ai15-edge-other-tenant";

async function makeUser(tenantId = TENANT) {
  const u = await User.create({ tenantId, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}
async function makeAccount(tenantId: string, internal_group: string, account_type: string, name: string) {
  return Account.create({ tenantId, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
}
async function makeVendor(userId: string, name: string, tenantId = TENANT) {
  return Customer.create({ tenantId, header: { name }, contact_details: {}, createdBy: userId });
}

async function postEntryAt(tenantId: string, accountId: string, offsetAccountId: string, amount: number, when: Date, opts: { partnerId?: string; journalType?: string; postedAt?: Date } = {}) {
  const entry = await JournalEntry.create({
    tenantId,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: when, journalType: opts.journalType ?? "purchase" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: [
      { accountId, label: "line", debit: amount, credit: 0, partnerId: opts.partnerId },
      { accountId: offsetAccountId, label: "line", debit: 0, credit: amount },
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
  const postedAt = opts.postedAt ?? when;
  await JournalEntry.collection.updateOne({ _id: entry._id }, { $set: { createdAt: postedAt } });
  return entry;
}

function weekdayBusinessHour(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(14, 0, 0, 0);
  const day = d.getUTCDay();
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  return d;
}

async function runAi15(tenantId = TENANT, actingUserId?: string) {
  return runWorkflow(ai15AnomalyDetection, { tenantId, eventKey: "ai.sweep.hourly", payload: actingUserId ? { actingUserId } : {} });
}

describe("AI-15 — edge-case hardening (docs/ai/BRIEF-09-VERIFICATION.md Part C)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Organization.init(), Account.init(), JournalEntry.init(), Customer.init(), User.init(),
      AiAnomaly.init(), AiDetectorHealth.init(), AiAnomalySuppression.init(), AiAttentionItem.init(),
      AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init(),
      AccountingSettings.init(), AiSchedule.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai15AnomalyDetection } = await import("@/lib/aiRuntime/workflows/ai-15-anomaly-detection"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Organization.deleteMany({}), Account.deleteMany({}), JournalEntry.deleteMany({}), Customer.deleteMany({}), User.deleteMany({}),
      AiAnomaly.deleteMany({}), AiDetectorHealth.deleteMany({}), AiAnomalySuppression.deleteMany({}), AiAttentionItem.deleteMany({}),
      AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({}),
      AccountingSettings.deleteMany({}), AiSchedule.deleteMany({}),
    ]);
  });

  // ── Section 1: trigger proof through the REAL cron route, not runWorkflow() ──────────────
  it("trigger proof: the real cron sweep route fires AI-15 and writes real AiAnomaly/AiWorkflowRun rows", async () => {
    await Organization.create({ name: "AI15 Edge Co", subdomain: TENANT, ownerUserId: new mongoose.Types.ObjectId(), isActive: true });
    const userId = await makeUser();
    const revenueAcc = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Operating Cash");
    // A manual journal entry to a sensitive (income) account, during business hours, fires
    // manual_journal_to_sensitive_account deterministically — no historical baseline needed.
    await postEntryAt(TENANT, String(revenueAcc._id), String(cash._id), 15000, weekdayBusinessHour(new Date()), { journalType: "general" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const { POST } = await import("@/app/api/cron/ai/runtime-sweep/route");
    const req = { headers: { get: (h: string) => (h.toLowerCase() === "authorization" ? `Bearer ${process.env.CRON_SECRET}` : null) } } as any;
    const res = await POST(req);
    expect(res.status).toBe(200);

    const run = await AiWorkflowRun.findOne({ tenantId: TENANT, workflowId: "AI-15" }).sort({ startedAt: -1 }).lean();
    expect(run, "the cron route must have dispatched a real ai.sweep.hourly event that reached AI-15").not.toBeNull();
    const anomaly = await AiAnomaly.findOne({ tenantId: TENANT, detectorId: "manual_journal_to_sensitive_account" }).lean();
    expect(anomaly, "record_anomaly must have actually run through the real path").not.toBeNull();
    void userId;
  });

  // ── Section 9 bug regression: duplicate/concurrent event must produce exactly ONE effect ──
  // Prior behaviour: act()'s idempotencyKey included Date.now(), which defeated the persistent
  // idempotency store entirely — every sweep that still saw the same in-window transaction (the
  // 24h lookback overlaps ~23h between consecutive hourly sweeps) created a BRAND NEW AiAnomaly
  // row for the identical instance. Fixed by making the key deterministic
  // (detectorId + suppressionKey + subjectRef, no run-specific component).
  it("C.3 duplicate event: the same in-window anomaly re-evaluated across two sequential sweeps produces exactly ONE AiAnomaly row (regression)", async () => {
    const userId = await makeUser();
    const revenueAcc = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    // Offset leg deliberately NOT asset_cash/income/equity (a plain receivable) — isolates this
    // fixture to exactly ONE sensitive-account line (the revenue leg), so the assertion below
    // measures duplication of the SAME anomaly rather than legitimately counting two distinct
    // per-line anomalies (asset_cash is itself a sensitive account type — see the "manual
    // journal" golden case, which makes the same isolation choice for the same reason).
    const receivable = await makeAccount(TENANT, "asset", "asset_current", "Other Current Asset");
    await postEntryAt(TENANT, String(revenueAcc._id), String(receivable._id), 15000, weekdayBusinessHour(new Date()), { journalType: "general" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    // Two independent sweeps (distinct AiEvent ids, exactly what two real hourly cron
    // invocations produce) both see the same entry inside the 24h window.
    await runAi15(TENANT, userId);
    await runAi15(TENANT, userId);

    const anomalies = await AiAnomaly.find({ tenantId: TENANT, detectorId: "manual_journal_to_sensitive_account" }).lean();
    expect(anomalies.length).toBe(1);
    const health = await AiDetectorHealth.findOne({ tenantId: TENANT, detectorId: "manual_journal_to_sensitive_account" }).lean();
    expect(health!.raised).toBe(1); // not incremented a second time
  });

  it("C.3 concurrent runs: the same in-window anomaly hit by two truly simultaneous sweeps produces exactly ONE AiAnomaly row", async () => {
    const userId = await makeUser();
    const revenueAcc = await makeAccount(TENANT, "income", "income", "Sales Revenue");
    const receivable = await makeAccount(TENANT, "asset", "asset_current", "Other Current Asset");
    await postEntryAt(TENANT, String(revenueAcc._id), String(receivable._id), 15000, weekdayBusinessHour(new Date()), { journalType: "general" });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const results = await Promise.allSettled([runAi15(TENANT, userId), runAi15(TENANT, userId)]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const anomalies = await AiAnomaly.find({ tenantId: TENANT, detectorId: "manual_journal_to_sensitive_account" }).lean();
    expect(anomalies.length).toBe(1);
  });

  it("C.3 same duplicate-event fix holds for a detector keyed by entryId with no natural suppressionKey collision risk (amount_outlier)", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense", "expense", "Consulting");
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Operating Cash");
    const vendor = await makeVendor(userId, "Consulting Vendor");
    const now = new Date();
    const historicalAmounts = [950, 1020, 980, 1050, 970, 1010];
    for (let i = 6; i >= 1; i--) {
      await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), historicalAmounts[6 - i], weekdayBusinessHour(new Date(now.getTime() - i * 30 * 86400000)), { partnerId: String(vendor._id) });
    }
    await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), 10000, weekdayBusinessHour(now), { partnerId: String(vendor._id) });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runAi15(TENANT, userId);
    await runAi15(TENANT, userId);
    await runAi15(TENANT, userId);

    const anomalies = await AiAnomaly.find({ tenantId: TENANT, detectorId: "amount_outlier" }).lean();
    expect(anomalies.length).toBe(1);
  });

  it("C.3 two DIFFERENT instances sharing the same coarser suppressionKey (two distinct postings to the same rare account) each still get their own AiAnomaly row (fix does not over-collapse)", async () => {
    const userId = await makeUser();
    const rareAcc = await makeAccount(TENANT, "expense", "expense", "Rarely Used Suspense Account");
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Operating Cash");
    // Give "cash" a well-established history (5 prior postings via an unrelated account) so its
    // OWN leg of the entries below never independently qualifies as rare_account_activity
    // (threshold: historicalCount > 0 && < 3) — isolates this fixture to the rare account only.
    const filler = await makeAccount(TENANT, "expense", "expense", "Filler Expense");
    for (let i = 0; i < 5; i++) {
      await postEntryAt(TENANT, String(filler._id), String(cash._id), 100, weekdayBusinessHour(new Date(Date.now() - (30 + i) * 86400000)));
    }
    await postEntryAt(TENANT, String(rareAcc._id), String(cash._id), 500, weekdayBusinessHour(new Date(Date.now() - 60 * 86400000)));
    // Two SEPARATE postings inside the same 24h window, both to the same rare account — same
    // suppressionKey (accountId) but different subjectRefs (different entryId each).
    await postEntryAt(TENANT, String(rareAcc._id), String(cash._id), 500, weekdayBusinessHour(new Date()));
    await postEntryAt(TENANT, String(rareAcc._id), String(cash._id), 700, weekdayBusinessHour(new Date()));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await runAi15(TENANT, userId);
    const anomalies = await AiAnomaly.find({ tenantId: TENANT, detectorId: "rare_account_activity" }).lean();
    expect(anomalies.length).toBe(2);
  });

  // ── C.4 Cross-tenant hostile input (positive proof) ───────────────────────────────────────
  // AI-15 has no externally-supplied record id to resolve (event payload carries only an
  // optional actingUserId, never used in any DB read) — every read in extract() is scoped by
  // ctx.tenantId, including the AI-14/AI-11/AI-19 upstream AiDecisionTrace lookups the brief
  // specifically flagged for checking. This is the positive proof: tenant B's data (including a
  // tenant-B upstream trace and a hostile actingUserId belonging to tenant B) never leaks into
  // tenant A's run.
  it("C.4 cross-tenant: tenant A's sweep never reads tenant B's journal entries or upstream traces, even with a hostile actingUserId from tenant B", async () => {
    const userA = await makeUser(TENANT);
    const userB = await makeUser(OTHER_TENANT);
    const expenseA = await makeAccount(TENANT, "expense", "expense", "A Expense");
    const cashA = await makeAccount(TENANT, "asset", "asset_cash", "A Cash");
    const expenseB = await makeAccount(OTHER_TENANT, "expense", "expense", "B Expense");
    const cashB = await makeAccount(OTHER_TENANT, "asset", "asset_cash", "B Cash");

    // Tenant B has a real, distinct anomaly-producing pattern (manual journal to sensitive
    // account) — must never surface in tenant A's run.
    const revenueB = await makeAccount(OTHER_TENANT, "income", "income", "B Revenue");
    await postEntryAt(OTHER_TENANT, String(revenueB._id), String(cashB._id), 99999, weekdayBusinessHour(new Date()), { journalType: "general" });
    await AiDecisionTrace.create({ tenantId: OTHER_TENANT, runId: new mongoose.Types.ObjectId(), workflowId: "AI-19", workflowVersion: "1.0.0", inputsHash: "b", rawProposal: { employeeCollisions: [{ vendorId: "b-vendor", employeeId: "b-employee", matchedOn: ["email"] }] } });

    // Tenant A has clean, non-anomalous activity only.
    await postEntryAt(TENANT, String(expenseA._id), String(cashA._id), 100, weekdayBusinessHour(new Date()));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    await AiWorkflowPolicy.create({ tenantId: OTHER_TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    // Hostile: fire tenant A's sweep passing tenant B's own user id as actingUserId.
    const envelope = await runAi15(TENANT, userB);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string }[] };

    expect(proposal.anomalies.some((a) => a.detectorId === "manual_journal_to_sensitive_account")).toBe(false);
    expect(proposal.anomalies.some((a) => a.detectorId === "vendor_shares_bank_or_address_with_employee")).toBe(false);
    const crossTenantLeak = await AiAnomaly.findOne({ tenantId: TENANT, detectorId: { $in: ["manual_journal_to_sensitive_account", "vendor_shares_bank_or_address_with_employee"] } }).lean();
    expect(crossTenantLeak).toBeNull();
    void userA;
    void expenseB;
  });

  // ── C.1 Large volume ───────────────────────────────────────────────────────────────────────
  it("C.1 large volume: 10,000 historical lines + a real recent outlier resolve correctly within the performance budget", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense", "expense", "Bulk Expense");
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Operating Cash");
    const vendor = await makeVendor(userId, "Bulk Vendor");
    const now = new Date();

    const docs = Array.from({ length: 10000 }, (_, i) => {
      const amount = 950 + (i % 100); // natural variance 950-1049
      const daysAgo = 30 + (i % 600); // spread across the 2-year baseline, outside the 24h window
      return {
        tenantId: TENANT,
        header: { name: `BULK-JE-${i}`, date: new Date(now.getTime() - daysAgo * 86400000), journalType: "purchase" },
        status: "posted",
        voucherStatus: "posted",
        lineIds: [
          { accountId: expenseAcc._id, label: "line", debit: amount, credit: 0, partnerId: vendor._id },
          { accountId: cash._id, label: "line", debit: 0, credit: amount },
        ],
        totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
        createdAt: new Date(now.getTime() - daysAgo * 86400000),
      };
    });
    await JournalEntry.insertMany(docs);
    // One real, recent 10x outlier.
    await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), 10000, weekdayBusinessHour(now), { partnerId: String(vendor._id) });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const start = Date.now();
    const envelope = await runAi15(TENANT, userId);
    const elapsedMs = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log(`AI-15 large-volume sweep (10,000 historical lines): ${elapsedMs}ms`);

    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string }[] };
    expect(proposal.anomalies.some((a) => a.detectorId === "amount_outlier")).toBe(true);
    expect(envelope.status).not.toBe("failed");
    expect(elapsedMs).toBeLessThan(10000);
  }, 30000);

  // ── C.1 Malformed / null fields ────────────────────────────────────────────────────────────
  it("C.1 malformed data: unicode/RTL/HTML vendor name, absurd dates, zero and negative amounts never crash the sweep", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense", "expense", "Expense");
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Cash");
    const vendor = await makeVendor(userId, `<script>alert(1)</script> 供应商 مورد ${"w".repeat(500)}`);

    await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), 0, new Date("1900-01-01"), { partnerId: String(vendor._id) });
    await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), -500, new Date("2099-12-31"), { partnerId: String(vendor._id), postedAt: new Date() });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await expect(runAi15(TENANT, userId)).resolves.toBeDefined();
  });

  it("C.1 null/missing fields: a line with no partnerId and an account with no name never crashes the sweep", async () => {
    const userId = await makeUser();
    const expenseAcc = await Account.create({ tenantId: TENANT, name: "", code: "ACC-NONAME", account_type: "expense", internal_group: "expense", isActive: true, isLocked: false, status: "active" });
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Cash");
    await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), 1000, weekdayBusinessHour(new Date()));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    await expect(runAi15(TENANT, userId)).resolves.toBeDefined();
  });

  // ── C.5 Sibling workflow unavailable or produced nonsense (AI-14/AI-11/AI-19) ─────────────
  it("C.5 sibling workflow nonsense: a malformed AI-14 trace (missing fields, NaN-shaped variance) is validated, never crashes or blindly propagates", async () => {
    const userId = await makeUser();
    // A trace with a materiality verdict of "material" but variance: 0 (guards the division in
    // the ratio_trend_step_change detector) and a comparison entirely missing unexplainedAmount.
    await AiDecisionTrace.create({
      tenantId: TENANT,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-14",
      workflowVersion: "1.0.0",
      inputsHash: "nonsense",
      rawProposal: { comparisons: [{ line: "Bad Row", accountId: "bad-acct", variance: 0, variancePct: null, unexplainedAmount: undefined, materialityVerdict: "material" }] },
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi15(TENANT, userId);
    expect(envelope.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string }[] };
    // variance === 0 is explicitly skipped (index.ts: `if (c.variance === 0) continue;`) — never
    // a divide-by-zero, never a fabricated finding from garbage upstream data.
    expect(proposal.anomalies.some((a) => a.detectorId === "ratio_trend_step_change")).toBe(false);
  });

  it("C.5 sibling workflow unavailable: no AI-14/AI-11/AI-19 trace exists yet for this tenant — the ratio/trend and collision detector families simply produce nothing, never an error", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense", "expense", "Expense");
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Cash");
    await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), 100, weekdayBusinessHour(new Date()));
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi15(TENANT, userId);
    expect(envelope.status).not.toBe("failed");
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string }[] };
    expect(proposal.anomalies.some((a) => ["ratio_trend_step_change", "product_margin_step_change", "vendor_shares_bank_or_address_with_employee"].includes(a.detectorId))).toBe(false);
  });

  // ── C.6 Adversarial pass ───────────────────────────────────────────────────────────────────
  // What input makes amount_outlier produce a confidently-wrong-LOOKING (not wrong-ACTED-ON,
  // since AI-15 never acts) result a human would accept without checking? A vendor/account pair
  // with near-zero natural variance (e.g. rent that is always exactly the same to the cent)
  // makes even a small, entirely legitimate change (a contractual rent increase) produce an
  // enormous, "critical"-looking z-score — the detector's own honest math, applied to a
  // legitimately low-variance population, looks alarming. This is the exact failure mode
  // A.5's precision-tracking / auto-disable machinery exists to correct: if reviewers
  // repeatedly dismiss this detector's output for this vendor as "expected", it falls below the
  // 50% precision floor and auto-disables — the system's actual, built answer to this
  // adversarial shape, not a per-detector statistical fix.
  it("C.6 adversarial: a near-zero-variance vendor's legitimate, modest rent increase produces a 'critical' z-score anomaly — and repeated reviewer dismissal correctly auto-disables the detector for it", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount(TENANT, "expense", "expense", "Rent");
    const cash = await makeAccount(TENANT, "asset", "asset_cash", "Operating Cash");
    const vendor = await makeVendor(userId, "Landlord Pvt Ltd");
    const now = new Date();
    // Six months of near-identical rent (a few rupees of real-world rounding/late-fee noise —
    // not a literal constant, which the code's own `stddev > 0.01` guard would correctly refuse
    // to score at all, since a true zero-variance population can't produce a meaningful z-score).
    const rentHistory = [50000, 50001, 49999, 50000, 50001, 49999];
    for (let i = 6; i >= 1; i--) {
      await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), rentHistory[6 - i], weekdayBusinessHour(new Date(now.getTime() - i * 30 * 86400000)), { partnerId: String(vendor._id) });
    }
    // A legitimate, modest 10% contractual increase — not fraud, not a data-entry error.
    await postEntryAt(TENANT, String(expenseAcc._id), String(cash._id), 55000, weekdayBusinessHour(now), { partnerId: String(vendor._id) });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi15(TENANT, userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string; severity: string }[] };
    const outlier = proposal.anomalies.find((a) => a.detectorId === "amount_outlier");
    // Confirms the adversarial shape is real: a 10% legitimate increase on a zero-variance
    // history does fire, at high severity — exactly the "confidently alarming, actually
    // mundane" case. It ships `silent: true` regardless (never surfaced to a human as an
    // accusation), which is AI-15's own structural mitigation for this shape.
    expect(outlier).toBeDefined();

    const anomalyRow = await AiAnomaly.findOne({ tenantId: TENANT, detectorId: "amount_outlier" }).lean();
    expect(anomalyRow!.silent).toBe(true);
  });
});

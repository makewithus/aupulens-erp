import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";
import { subMonths } from "date-fns";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai15";

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

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai15AnomalyDetection: typeof import("@/lib/aiRuntime/workflows/ai-15-anomaly-detection").ai15AnomalyDetection;
let callTool: typeof import("@/lib/aiRuntime/tools/registry").callTool;

const TENANT = "ai15-tenant";

async function makeUser() {
  const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
  return String(u._id);
}
async function makeAccount(internal_group: string, account_type: string, name: string) {
  return Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
}
async function makeVendor(userId: string, name: string) {
  return Customer.create({ tenantId: TENANT, header: { name }, contact_details: {}, createdBy: userId });
}

// Creates a posted JournalEntry and force-sets createdAt/header.date afterward (Mongoose's
// timestamps plugin otherwise stamps createdAt at insert time regardless of what's passed).
async function postEntryAt(accountId: string, offsetAccountId: string, amount: number, when: Date, opts: { partnerId?: string; journalType?: string; postedAt?: Date } = {}) {
  const entry = await JournalEntry.create({
    tenantId: TENANT,
    header: { name: `JE-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: when, journalType: opts.journalType ?? "general" },
    status: "posted",
    voucherStatus: "posted",
    lineIds: [
      { accountId, label: "line", debit: amount, credit: 0, partnerId: opts.partnerId },
      { accountId: offsetAccountId, label: "line", debit: 0, credit: amount },
    ],
    totals: { amountUntaxed: amount, amountTax: 0, amountTotal: amount },
  });
  const postedAt = opts.postedAt ?? when;
  // Mongoose's timestamps plugin intercepts Model.updateOne too (re-stamping createdAt on
  // upsert-shaped paths) — go through the raw driver collection to actually force it.
  await JournalEntry.collection.updateOne({ _id: entry._id }, { $set: { createdAt: postedAt } });
  return entry;
}

async function runAi15(actingUserId?: string) {
  return runWorkflow(ai15AnomalyDetection, { tenantId: TENANT, eventKey: "ai.sweep.hourly", payload: actingUserId ? { actingUserId } : {} });
}

describe("AI-15 — Anomaly detection", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([
      Account.init(),
      JournalEntry.init(),
      Customer.init(),
      User.init(),
      AiAnomaly.init(),
      AiDetectorHealth.init(),
      AiAnomalySuppression.init(),
      AiAttentionItem.init(),
      AiWorkflowRun.init(),
      AiDecisionTrace.init(),
      AiEvent.init(),
      AiToolCall.init(),
      AiWorkflowPolicy.init(),
      AccountingSettings.init(),
    ]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai15AnomalyDetection } = await import("@/lib/aiRuntime/workflows/ai-15-anomaly-detection"));
    ({ callTool } = await import("@/lib/aiRuntime/tools/registry"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([
      Account.deleteMany({}),
      JournalEntry.deleteMany({}),
      Customer.deleteMany({}),
      User.deleteMany({}),
      AiAnomaly.deleteMany({}),
      AiDetectorHealth.deleteMany({}),
      AiAnomalySuppression.deleteMany({}),
      AiAttentionItem.deleteMany({}),
      AiWorkflowRun.deleteMany({}),
      AiDecisionTrace.deleteMany({}),
      AiEvent.deleteMany({}),
      AiToolCall.deleteMany({}),
      AiWorkflowPolicy.deleteMany({}),
      AccountingSettings.deleteMany({}),
    ]);
  });

  it("no detector can propose a correction or reversal at any confidence — no write tool touches a financial document (source-grep)", () => {
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-15-anomaly-detection || true`,
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    expect(output.trim()).toBe("");
  });

  it("a year of normal, consistent activity produces ZERO anomalies — the single most important test", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount("expense", "expense", "Office Supplies");
    const cash = await makeAccount("asset", "asset_cash", "Operating Cash");
    const vendorA = await makeVendor(userId, "Steady Vendor A");
    const vendorB = await makeVendor(userId, "Steady Vendor B");

    const now = new Date();
    // ~11 months of consistent monthly postings, on a weekday, during business hours, via a
    // real business-document journal type (never "general"), never backdated.
    for (let i = 11; i >= 2; i--) {
      const when = weekdayBusinessHour(subMonths(now, i));
      await postEntryAt(String(expenseAcc._id), String(cash._id), 5000, when, { partnerId: String(vendorA._id), journalType: "purchase" });
      await postEntryAt(String(expenseAcc._id), String(cash._id), 3000, when, { partnerId: String(vendorB._id), journalType: "purchase" });
    }
    // Recent activity (inside the last 24h, what actually gets scanned) — identical pattern.
    const today = weekdayBusinessHour(now);
    await postEntryAt(String(expenseAcc._id), String(cash._id), 5000, today, { partnerId: String(vendorA._id), journalType: "purchase" });
    await postEntryAt(String(expenseAcc._id), String(cash._id), 3000, today, { partnerId: String(vendorB._id), journalType: "purchase" });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi15(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: unknown[] };

    expect(proposal.anomalies.length).toBe(0);
    const anomalies = await AiAnomaly.find({ tenantId: TENANT }).lean();
    expect(anomalies.length).toBe(0);
  });

  it("a 10x invoice fires the amount_outlier detector", async () => {
    const userId = await makeUser();
    const expenseAcc = await makeAccount("expense", "expense", "Consulting");
    const cash = await makeAccount("asset", "asset_cash", "Operating Cash");
    const vendor = await makeVendor(userId, "Consulting Vendor");
    const now = new Date();

    // Natural variance around 1000 (never a flat constant — a zero-stddev history can't produce
    // a meaningful z-score, by design, so a real test needs real variance).
    const historicalAmounts = [950, 1020, 980, 1050, 970, 1010, 990, 1030];
    for (let i = 8; i >= 1; i--) {
      const when = weekdayBusinessHour(subMonths(now, i));
      await postEntryAt(String(expenseAcc._id), String(cash._id), historicalAmounts[8 - i], when, { partnerId: String(vendor._id), journalType: "purchase" });
    }
    const today = weekdayBusinessHour(now);
    await postEntryAt(String(expenseAcc._id), String(cash._id), 10000, today, { partnerId: String(vendor._id), journalType: "purchase" });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi15(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string }[] };
    expect(proposal.anomalies.some((a) => a.detectorId === "amount_outlier")).toBe(true);
  });

  it("an after-hours journal to revenue fires HIGH severity", async () => {
    const userId = await makeUser();
    const revenueAcc = await makeAccount("income", "income", "Sales Revenue");
    const cash = await makeAccount("asset", "asset_cash", "Operating Cash");
    // 2am UTC, guaranteed to fall within the last 24h regardless of what day/time the test
    // itself runs at (unlike a fixed calendar Saturday, which is only ever within the lookback
    // window on the days it actually is one).
    const afterHours = afterHoursWithinWindow(new Date());
    await postEntryAt(String(revenueAcc._id), String(cash._id), 15000, afterHours, { journalType: "general", postedAt: afterHours });

    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi15(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string; severity: string }[] };
    const weekendAnomaly = proposal.anomalies.find((a) => a.detectorId === "weekend_or_after_hours_posting");
    expect(weekendAnomaly).toBeDefined();
    expect(weekendAnomaly!.severity).toBe("high");
  });

  it("suppression persists across runs and scopes correctly to the same detector+key only", async () => {
    const userId = await makeUser();
    const revenueAcc = await makeAccount("income", "income", "Sales Revenue");
    // Non-sensitive offset account (not asset_cash) so only the revenue leg of each entry can
    // ever trigger this detector — isolates the suppression-scoping assertion below from the
    // real, separate fact that the entry's other leg is evaluated independently.
    const receivable = await makeAccount("asset", "asset_current", "Other Current Asset");
    const afterHours = afterHoursWithinWindow(new Date());

    await callTool(
      "suppress_anomaly",
      { tenantId: TENANT, detectorId: "weekend_or_after_hours_posting", suppressionKey: String(revenueAcc._id), windowDays: 30, reason: "expected month-end close activity" },
      { tenantId: TENANT, runId: new mongoose.Types.ObjectId().toString(), requestedAutonomy: "execute" },
    );

    await postEntryAt(String(revenueAcc._id), String(receivable._id), 15000, afterHours, { journalType: "general", postedAt: afterHours });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    // Run twice — suppression must hold on both runs, not just the first.
    await runAi15(userId);
    const envelope2 = await runAi15(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope2.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string; suppressionKey?: string }[] };
    // The revenue leg (the suppressed key) never appears — the receivable leg's own, separate
    // low-severity anomaly (a different, unsuppressed suppressionKey) legitimately still does,
    // which is why this checks the specific key rather than the detector's presence at all.
    expect(proposal.anomalies.some((a) => a.detectorId === "weekend_or_after_hours_posting" && a.suppressionKey === String(revenueAcc._id))).toBe(false);

    // A DIFFERENT account is not suppressed by this same-detector suppression scoped to revenueAcc.
    const otherRevenueAcc = await makeAccount("income", "income", "Other Revenue");
    await postEntryAt(String(otherRevenueAcc._id), String(receivable._id), 9000, afterHours, { journalType: "general", postedAt: afterHours });
    const envelope3 = await runAi15(userId);
    const trace3 = await AiDecisionTrace.findOne({ runId: envelope3.runId }).lean();
    const proposal3 = trace3!.rawProposal as unknown as { anomalies: { detectorId: string; suppressionKey?: string }[] };
    expect(proposal3.anomalies.some((a) => a.detectorId === "weekend_or_after_hours_posting" && a.suppressionKey === String(otherRevenueAcc._id))).toBe(true);
  });

  it("a detector below the precision floor over the minimum sample auto-disables and raises a single INFO item", async () => {
    const tenantId = TENANT;
    const runId = new mongoose.Types.ObjectId().toString();
    const ctx = { tenantId, runId, requestedAutonomy: "execute" as const };

    // 20 reviewed anomalies, only 5 confirmed real (25% precision) — below the 50% floor.
    const anomalyIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const { result } = await callTool<{ anomalyId: string }>(
        "record_anomaly",
        {
          tenantId,
          detectorId: "test_detector_precision",
          runId,
          severity: "low",
          subjectRefs: [],
          observed: "test",
          expectedRange: "test",
          deviation: "test",
          historicalBasis: "test",
          evidence: [],
          suggestedChecks: [],
          suppressionKey: `key-${i}`,
          silent: true,
        },
        ctx,
      );
      anomalyIds.push(result.anomalyId);
    }

    for (let i = 0; i < 20; i++) {
      const outcome = i < 5 ? "confirm_anomaly" : "dismiss_anomaly";
      await callTool(outcome, { tenantId, anomalyId: anomalyIds[i] }, ctx);
    }

    const health = await AiDetectorHealth.findOne({ tenantId, detectorId: "test_detector_precision" }).lean();
    expect(health!.sampleSize).toBe(20);
    expect(health!.precision).toBeCloseTo(0.25, 2);
    expect(health!.autoDisabled).toBe(true);

    const infoItem = await AiAttentionItem.findOne({ tenantId, dedupeKey: `ai15-auto-disabled:${tenantId}:test_detector_precision` }).lean();
    expect(infoItem).not.toBeNull();
    expect(infoItem!.priority).toBe("info");
  });

  it("an auto-disabled detector raises nothing further on the next sweep", async () => {
    const userId = await makeUser();
    const revenueAcc = await makeAccount("income", "income", "Sales Revenue");
    const cash = await makeAccount("asset", "asset_cash", "Operating Cash");
    await AiDetectorHealth.create({ tenantId: TENANT, detectorId: "weekend_or_after_hours_posting", raised: 20, confirmed: 2, dismissed: 18, precision: 0.1, sampleSize: 20, autoDisabled: true, autoDisabledAt: new Date() });

    const afterHours = afterHoursWithinWindow(new Date());
    await postEntryAt(String(revenueAcc._id), String(cash._id), 15000, afterHours, { journalType: "general", postedAt: afterHours });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });

    const envelope = await runAi15(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string }[] };
    expect(proposal.anomalies.some((a) => a.detectorId === "weekend_or_after_hours_posting")).toBe(false);
  });

  it("vendor_shares_bank_or_address_with_employee reads AI-19's own employee-collision output (docs/ai/BRIEF-08a-BATCH-G.md item 4) rather than a second matching implementation", async () => {
    const userId = await makeUser();
    // A fake AI-19 trace stands in for a real run — AI-15 only reads the shape AI-19 produces,
    // so this asserts the wiring without re-running AI-19's own entity matching here.
    await AiDecisionTrace.create({
      tenantId: TENANT,
      runId: new mongoose.Types.ObjectId(),
      workflowId: "AI-19",
      workflowVersion: "1.0.0",
      inputsHash: "test",
      rawProposal: { employeeCollisions: [{ vendorId: "vendor-x", employeeId: "employee-y", matchedOn: ["email"] }] },
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-15", killSwitchEnabled: true, maxAutonomyLevel: "observe" });
    const envelope = await runAi15(userId);
    const trace = await AiDecisionTrace.findOne({ runId: envelope.runId }).lean();
    const proposal = trace!.rawProposal as unknown as { anomalies: { detectorId: string; subjectRefs: { model: string; id: string }[] }[] };
    const found = proposal.anomalies.find((a) => a.detectorId === "vendor_shares_bank_or_address_with_employee");
    expect(found).toBeDefined();
    expect(found!.subjectRefs).toEqual([{ model: "Customer", id: "vendor-x" }, { model: "Employee", id: "employee-y" }]);
  });

  it("record_anomaly_review('expected') dismisses the anomaly AND writes its suppression key, atomically (docs/ai/BRIEF-06-BATCH-E.md Part 0.3)", async () => {
    const tenantId = TENANT;
    const runId = new mongoose.Types.ObjectId().toString();
    const ctx = { tenantId, runId, requestedAutonomy: "execute" as const };

    const { result: recorded } = await callTool<{ anomalyId: string }>(
      "record_anomaly",
      {
        tenantId,
        detectorId: "test_detector_review",
        runId,
        severity: "low",
        subjectRefs: [],
        observed: "test",
        expectedRange: "test",
        deviation: "test",
        historicalBasis: "test",
        evidence: [],
        suggestedChecks: [],
        suppressionKey: "review-key-1",
        silent: true,
      },
      ctx,
    );

    const { result } = await callTool<{ autoDisabled: boolean; suppressedUntil: string }>(
      "record_anomaly_review",
      { tenantId, anomalyId: recorded.anomalyId, outcome: "expected" },
      ctx,
    );

    const anomaly = await AiAnomaly.findById(recorded.anomalyId).lean();
    expect(anomaly!.status).toBe("dismissed");

    const suppression = await AiAnomalySuppression.findOne({ tenantId, detectorId: "test_detector_review", suppressionKey: "review-key-1" }).lean();
    expect(suppression).not.toBeNull();
    expect(new Date(suppression!.suppressedUntil).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(result.suppressedUntil).getTime()).toBe(new Date(suppression!.suppressedUntil).getTime());

    const health = await AiDetectorHealth.findOne({ tenantId, detectorId: "test_detector_review" }).lean();
    expect(health!.dismissed).toBe(1);
  });

  it("record_anomaly_review('confirmed') behaves like confirm_anomaly — no suppression written", async () => {
    const tenantId = TENANT;
    const runId = new mongoose.Types.ObjectId().toString();
    const ctx = { tenantId, runId, requestedAutonomy: "execute" as const };

    const { result: recorded } = await callTool<{ anomalyId: string }>(
      "record_anomaly",
      {
        tenantId,
        detectorId: "test_detector_review2",
        runId,
        severity: "low",
        subjectRefs: [],
        observed: "test",
        expectedRange: "test",
        deviation: "test",
        historicalBasis: "test",
        evidence: [],
        suggestedChecks: [],
        suppressionKey: "review-key-2",
        silent: true,
      },
      ctx,
    );

    await callTool("record_anomaly_review", { tenantId, anomalyId: recorded.anomalyId, outcome: "confirmed" }, ctx);

    const anomaly = await AiAnomaly.findById(recorded.anomalyId).lean();
    expect(anomaly!.status).toBe("confirmed");
    const suppression = await AiAnomalySuppression.findOne({ tenantId, detectorId: "test_detector_review2" }).lean();
    expect(suppression).toBeNull();
    const health = await AiDetectorHealth.findOne({ tenantId, detectorId: "test_detector_review2" }).lean();
    expect(health!.confirmed).toBe(1);
  });
});

function weekdayBusinessHour(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(14, 0, 0, 0);
  const day = d.getUTCDay();
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1); // Sunday -> Monday
  if (day === 6) d.setUTCDate(d.getUTCDate() + 2); // Saturday -> Monday
  return d;
}

// 2am UTC today, or yesterday if that would be in the future — always inside the last 24h
// regardless of what wall-clock time the test suite actually runs at.
function afterHoursWithinWindow(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(2, 0, 0, 0);
  if (d.getTime() > now.getTime()) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

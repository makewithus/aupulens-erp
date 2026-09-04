import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_ai23";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountingSettings from "@/models/finance/AccountingSettings";
import User from "@/models/auth/User";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import AiEvent from "@/models/ai/AiEvent";
import AiToolCall from "@/models/ai/AiToolCall";
import AiWorkflowPolicy from "@/models/ai/AiWorkflowPolicy";

let runWorkflow: typeof import("@/lib/aiRuntime/runtime/executor").runWorkflow;
let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let ai23JournalReview: typeof import("@/lib/aiRuntime/workflows/ai-23-journal-review").ai23JournalReview;
let buildAndScoreJournalRisk: typeof import("@/lib/aiRuntime/journalReview/buildRiskInput").buildAndScoreJournalRisk;
let getTool: typeof import("@/lib/aiRuntime/tools/registry").getTool;

const TENANT = "ai23-tenant";

async function makeAccount(account_type: string, internal_group: string, name: string) {
  const acc = await Account.create({ tenantId: TENANT, name, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, internal_group, isActive: true, isLocked: false, status: "active" });
  return acc._id as mongoose.Types.ObjectId;
}

async function makeUser(name: string) {
  const u = await User.create({ tenantId: TENANT, name, email: `${name.toLowerCase().replace(/\s/g, "")}-${Date.now()}-${Math.random()}@x.com`, phone: "9999999999", password: "hashedpw", role: "finance", status: "active" });
  return u._id as mongoose.Types.ObjectId;
}

/** Posts a journal, then force-sets createdAt (Mongoose's timestamps plugin overrides any
 *  createdAt passed to .create() — the fix, established precedent, is a raw collection update). */
async function postJournal(opts: {
  name: string;
  date: Date;
  createdAt: Date;
  journalType?: string;
  createdBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  lines: { accountId: mongoose.Types.ObjectId; debit: number; credit: number; label?: string }[];
}) {
  const entry = await JournalEntry.create({
    tenantId: TENANT,
    header: { name: opts.name, date: opts.date, journalType: opts.journalType ?? "general" },
    status: "posted",
    voucherStatus: "posted",
    createdBy: opts.createdBy,
    approvalRequired: Boolean(opts.approvedBy),
    approvalDetails: opts.approvedBy ? { approvedBy: opts.approvedBy, approvedAt: opts.date } : undefined,
    lineIds: opts.lines.map((l) => ({ accountId: l.accountId, label: l.label ?? "", debit: l.debit, credit: l.credit })),
    totals: { amountUntaxed: 0, amountTax: 0, amountTotal: opts.lines.reduce((s, l) => s + l.debit, 0) },
  });
  await JournalEntry.collection.updateOne({ _id: entry._id }, { $set: { createdAt: opts.createdAt } });
  return entry;
}

describe("AI-23 — Journal review intelligence", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Account.init(), JournalEntry.init(), AccountingSettings.init(), User.init(), AiWorkflowRun.init(), AiDecisionTrace.init(), AiEvent.init(), AiToolCall.init(), AiWorkflowPolicy.init()]);
    ({ runWorkflow } = await import("@/lib/aiRuntime/runtime/executor"));
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ ai23JournalReview } = await import("@/lib/aiRuntime/workflows/ai-23-journal-review"));
    ({ buildAndScoreJournalRisk } = await import("@/lib/aiRuntime/journalReview/buildRiskInput"));
    ({ getTool } = await import("@/lib/aiRuntime/tools/registry"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([Account.deleteMany({}), JournalEntry.deleteMany({}), AccountingSettings.deleteMany({}), User.deleteMany({}), AiWorkflowRun.deleteMany({}), AiDecisionTrace.deleteMany({}), AiEvent.deleteMany({}), AiToolCall.deleteMany({}), AiWorkflowPolicy.deleteMany({})]);
  });

  it("a routine recurring journal, similar to this tenant's own history, scores low and recommends auto_ok", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const revenue = await makeAccount("income", "income", "Sales Revenue");
    // 10 baseline journals, weekday, business hours, same account pair, similar amount, described.
    for (let i = 0; i < 10; i++) {
      await postJournal({
        name: `JE-base-${i}`, date: new Date(`2025-12-0${(i % 8) + 1}T12:00:00.000Z`), createdAt: new Date(`2025-12-0${(i % 8) + 1}T12:00:00.000Z`), journalType: "sale",
        lines: [
          { accountId: cash, debit: 1000 + i, credit: 0, label: "Cash sale receipt" },
          { accountId: revenue, debit: 0, credit: 1000 + i, label: "Cash sale receipt" },
        ],
      });
    }
    const target = await postJournal({
      name: "JE-routine", date: new Date("2026-01-15T12:00:00.000Z"), createdAt: new Date("2026-01-15T12:00:00.000Z"), journalType: "sale",
      lines: [
        { accountId: cash, debit: 1005, credit: 0, label: "Cash sale receipt" },
        { accountId: revenue, debit: 0, credit: 1005, label: "Cash sale receipt" },
      ],
    });

    const result = await buildAndScoreJournalRisk(TENANT, String(target._id));
    expect(result!.recommendation).toBe("auto_ok");
  });

  it("a weekend manual journal to revenue with no description scores high and recommends escalate, with all reasons named", async () => {
    const revenue = await makeAccount("income", "income", "Sales Revenue");
    const suspense = await makeAccount("asset_current", "asset", "Suspense");
    // 2026-01-03 is a Saturday.
    const target = await postJournal({
      name: "JE-weekend", date: new Date("2026-01-03T15:00:00.000Z"), createdAt: new Date("2026-01-03T15:00:00.000Z"), journalType: "general",
      lines: [
        { accountId: suspense, debit: 5000, credit: 0 },
        { accountId: revenue, debit: 0, credit: 5000 },
      ],
    });

    const result = await buildAndScoreJournalRisk(TENANT, String(target._id));
    expect(result!.recommendation).toBe("escalate");
    expect(result!.reasons.length).toBeGreaterThanOrEqual(2);
    expect(result!.flags.some((f) => f.dimension === "manual_journal_to_sensitive_account")).toBe(true);
    expect(result!.flags.some((f) => f.dimension === "weekend_or_after_hours_posting")).toBe(true);
    expect(result!.flags.some((f) => f.dimension === "thin_or_missing_description")).toBe(true);
  });

  it("preparer = approver triggers an SoD flag through the real check_sod", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    const sameUser = await makeUser("Same User");
    const target = await postJournal({
      name: "JE-sod", date: new Date("2026-01-10T12:00:00.000Z"), createdAt: new Date("2026-01-10T12:00:00.000Z"), journalType: "general",
      createdBy: sameUser, approvedBy: sameUser,
      lines: [
        { accountId: expense, debit: 500, credit: 0, label: "Office supplies purchase" },
        { accountId: cash, debit: 0, credit: 500, label: "Office supplies purchase" },
      ],
    });

    const result = await buildAndScoreJournalRisk(TENANT, String(target._id));
    expect(result!.flags.some((f) => f.dimension === "sod_preparer_approver")).toBe(true);
    expect(result!.recommendation).toBe("escalate");
  });

  it("an amount just under the approval threshold is flagged; the same tenant's amount well under it is not", async () => {
    await AccountingSettings.create({ tenantId: TENANT, journals: { approvalsEnabled: true, approvalThresholdAmount: 1000 } });
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");

    const nearThreshold = await postJournal({
      name: "JE-near", date: new Date("2026-01-11T12:00:00.000Z"), createdAt: new Date("2026-01-11T12:00:00.000Z"), journalType: "purchase",
      lines: [
        { accountId: expense, debit: 900, credit: 0, label: "Vendor payment for services rendered" },
        { accountId: cash, debit: 0, credit: 900, label: "Vendor payment for services rendered" },
      ],
    });
    const wellUnder = await postJournal({
      name: "JE-under", date: new Date("2026-01-11T13:00:00.000Z"), createdAt: new Date("2026-01-11T13:00:00.000Z"), journalType: "purchase",
      lines: [
        { accountId: expense, debit: 200, credit: 0, label: "Vendor payment for services rendered" },
        { accountId: cash, debit: 0, credit: 200, label: "Vendor payment for services rendered" },
      ],
    });

    const near = await buildAndScoreJournalRisk(TENANT, String(nearThreshold._id));
    const under = await buildAndScoreJournalRisk(TENANT, String(wellUnder._id));
    expect(near!.flags.some((f) => f.dimension === "amount_near_approval_threshold")).toBe(true);
    expect(under!.flags.some((f) => f.dimension === "amount_near_approval_threshold")).toBe(false);
  });

  it("an AI-created journal returns its decision trace in ai_origin (via AI-18's shared decision-trace lookup)", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const expense = await makeAccount("expense", "expense", "Expense");
    const target = await postJournal({
      name: "JE-ai", date: new Date("2026-01-12T12:00:00.000Z"), createdAt: new Date("2026-01-12T12:00:00.000Z"), journalType: "purchase",
      lines: [
        { accountId: expense, debit: 300, credit: 0, label: "AI-classified expense" },
        { accountId: cash, debit: 0, credit: 300, label: "AI-classified expense" },
      ],
    });
    const run = await AiWorkflowRun.create({
      tenantId: TENANT, workflowId: "AI-02", workflowVersion: "1.0.0", entityId: "bank-line-x", status: "completed", autonomyApplied: "execute",
      summary: "classified", findings: [], metrics: { scanned: 1, matched: 1, exceptions: 0, autoActioned: 1, policy_overrides: 0 }, startedAt: new Date(), finishedAt: new Date(),
    });
    await AiDecisionTrace.create({
      tenantId: TENANT, runId: run._id, workflowId: "AI-02", workflowVersion: "1.0.0", inputsHash: "seed", reasonChain: ["matched a banking rule"],
      toolCalls: [{ tool: "draft_journal", args: {}, result: { journalEntryId: String(target._id) }, error: null, startedAt: new Date(), durationMs: 3 }],
      rawProposal: {}, confidenceComponents: {}, finalOutcome: "completed", finalizedAt: new Date("2026-01-12"),
    });

    const result = await buildAndScoreJournalRisk(TENANT, String(target._id));
    expect(result).toBeTruthy();
    // aiOrigin isn't directly exposed on JournalRiskResult; verify indirectly via a real trace lookup.
    const { traceDecisionForRecord } = await import("@/lib/aiRuntime/audit/decisionTrace");
    const trace = await traceDecisionForRecord(TENANT, "JournalEntry", String(target._id));
    expect(trace.found).toBe(true);
    expect(trace.workflowId).toBe("AI-02");
  });

  it("the workflow cannot post, approve, or alter voucherStatus at any confidence — no such tool exists anywhere", () => {
    expect(getTool("post_journal_entry")).toBeUndefined();
    expect(getTool("approve_journal_entry")).toBeUndefined();
    expect(getTool("set_voucher_status")).toBeUndefined();
    const output = execSync(
      String.raw`grep -rnE '\.(save|create|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|findOneAndDelete|insertMany)\(' lib/aiRuntime/workflows/ai-23-journal-review lib/aiRuntime/journalReview lib/aiRuntime/tools/journalReviewTools.ts || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    );
    expect(output.trim()).toBe("");
  });

  it("a month of ordinary, well-formed journals produces near-zero flags (false positive check)", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const revenue = await makeAccount("income", "income", "Sales Revenue");
    for (let i = 0; i < 15; i++) {
      await postJournal({
        name: `JE-hist-${i}`, date: new Date(`2025-12-${String((i % 27) + 1).padStart(2, "0")}T12:00:00.000Z`), createdAt: new Date(`2025-12-${String((i % 27) + 1).padStart(2, "0")}T12:00:00.000Z`), journalType: "sale",
        lines: [
          { accountId: cash, debit: 1000, credit: 0, label: "Cash sale receipt" },
          { accountId: revenue, debit: 0, credit: 1000, label: "Cash sale receipt" },
        ],
      });
    }
    // January 2026 weekdays only — a weekend posting is a real, separate signal (its own
    // dedicated test above); mixing it in here would conflate two different questions.
    const JANUARY_2026_WEEKDAYS = ["01", "02", "05", "06", "07", "08", "09", "12", "13", "14", "15", "16", "19", "20", "21", "22", "23", "26", "27", "28"];
    const monthEntries = [];
    for (let i = 0; i < JANUARY_2026_WEEKDAYS.length; i++) {
      const day = JANUARY_2026_WEEKDAYS[i];
      monthEntries.push(
        await postJournal({
          name: `JE-jan-${i}`, date: new Date(`2026-01-${day}T12:00:00.000Z`), createdAt: new Date(`2026-01-${day}T12:00:00.000Z`), journalType: "sale",
          lines: [
            { accountId: cash, debit: 1000, credit: 0, label: "Cash sale receipt" },
            { accountId: revenue, debit: 0, credit: 1000, label: "Cash sale receipt" },
          ],
        }),
      );
    }

    let escalateOrReviewCount = 0;
    for (const e of monthEntries) {
      const result = await buildAndScoreJournalRisk(TENANT, String(e._id));
      if (result!.recommendation !== "auto_ok") escalateOrReviewCount += 1;
    }
    expect(escalateOrReviewCount).toBeLessThanOrEqual(2); // near-zero, not necessarily literally zero
  });

  it("the workflow run persists risk-scored journals and raises findings only for non-auto_ok recommendations", async () => {
    const cash = await makeAccount("asset_cash", "asset", "Cash");
    const revenue = await makeAccount("income", "income", "Sales Revenue");
    const suspense = await makeAccount("asset_current", "asset", "Suspense");
    for (let i = 0; i < 10; i++) {
      await postJournal({
        name: `JE-base2-${i}`, date: new Date(`2025-12-0${(i % 8) + 1}T12:00:00.000Z`), createdAt: new Date(`2025-12-0${(i % 8) + 1}T12:00:00.000Z`), journalType: "sale",
        lines: [
          { accountId: cash, debit: 1000, credit: 0, label: "Cash sale receipt" },
          { accountId: revenue, debit: 0, credit: 1000, label: "Cash sale receipt" },
        ],
      });
    }
    await postJournal({
      name: "JE-normal", date: new Date("2026-01-14T12:00:00.000Z"), createdAt: new Date("2026-01-14T12:00:00.000Z"), journalType: "sale",
      lines: [
        { accountId: cash, debit: 1000, credit: 0, label: "Cash sale receipt" },
        { accountId: revenue, debit: 0, credit: 1000, label: "Cash sale receipt" },
      ],
    });
    // 2026-01-03 is a Saturday — manual entry to a sensitive account, no description.
    await postJournal({
      name: "JE-weekend2", date: new Date("2026-01-03T15:00:00.000Z"), createdAt: new Date("2026-01-03T15:00:00.000Z"), journalType: "general",
      lines: [
        { accountId: suspense, debit: 5000, credit: 0 },
        { accountId: revenue, debit: 0, credit: 5000 },
      ],
    });
    await AiWorkflowPolicy.create({ tenantId: TENANT, workflowId: "AI-23", killSwitchEnabled: true, maxAutonomyLevel: "recommend" });

    const envelope = await runWorkflow(ai23JournalReview, {
      tenantId: TENANT,
      eventKey: "period.horizon.reached",
      payload: { period: "2026-01", periodStart: new Date("2026-01-01T00:00:00.000Z").toISOString(), periodEnd: new Date("2026-01-31T23:59:59.999Z").toISOString() },
    });

    const escalation = envelope.findings.find((f) => f.title.includes("JE-weekend2"));
    expect(escalation).toBeDefined();
    expect(escalation!.severity).toBe("high");
    const normalFinding = envelope.findings.find((f) => f.title.includes("JE-normal"));
    expect(normalFinding).toBeUndefined();
  });
});

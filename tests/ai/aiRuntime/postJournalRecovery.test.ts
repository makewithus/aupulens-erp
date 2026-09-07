import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_post_journal_recovery";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule, { AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";
import AiOperationsRepairLog from "@/models/ai/AiOperationsRepairLog";
import User from "@/models/auth/User";
import { AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";

let bootstrapAiRuntime: typeof import("@/lib/aiRuntime/bootstrap").bootstrapAiRuntime;
let callTool: typeof import("@/lib/aiRuntime/tools/registry").callTool;
let findStuckSchedulePeriods: typeof import("@/lib/aiRuntime/opsHealth/detect").findStuckSchedulePeriods;
let PeriodAlreadyPostedError: typeof import("@/lib/aiRuntime/tools/scheduleWriteTools").PeriodAlreadyPostedError;

const TENANT = "post-journal-recovery-tenant";

/**
 * Chunk 10a — closes the real recovery gap docs/ai/audits/FAILURE_MODES.md surfaced: a crash
 * between post_journal's period compare-and-swap (PENDING -> DRAFTED) and its final journal save
 * used to leave the period permanently stuck, AND — worse, discovered while designing this fix —
 * the old CAS filter (`status !== POSTED`) still matched a DRAFTED period, so a genuine retry
 * (e.g. via `replay()` re-executing a crashed run's act(), which re-issues the same
 * `rt.callTool("post_journal", ..., {idempotencyKey})` call) would silently create a SECOND
 * journal entry rather than erroring. These tests call `callTool()` directly, without an
 * idempotencyKey, to exercise `post_journal`'s own internal CAS/recovery logic in isolation from
 * the AiToolCall-level lock — the two are independent safety layers.
 */
describe("post_journal recovery — a period stuck at DRAFTED after a simulated crash (Chunk 10a)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Account.init(), JournalEntry.init(), AiSchedule.init(), AiOperationsRepairLog.init(), User.init()]);
    ({ bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap"));
    ({ callTool } = await import("@/lib/aiRuntime/tools/registry"));
    ({ findStuckSchedulePeriods } = await import("@/lib/aiRuntime/opsHealth/detect"));
    ({ PeriodAlreadyPostedError } = await import("@/lib/aiRuntime/tools/scheduleWriteTools"));
    bootstrapAiRuntime();
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([Account.deleteMany({}), JournalEntry.deleteMany({}), AiSchedule.deleteMany({}), AiOperationsRepairLog.deleteMany({}), User.deleteMany({})]);
  });

  async function makeAccount(account_type: string) {
    const acc = await Account.create({ tenantId: TENANT, name: `Account ${account_type}`, code: `ACC-${Math.random().toString(36).slice(2, 8)}`, account_type, isActive: true, isLocked: false, status: "active" });
    return String(acc._id);
  }

  async function makeUser() {
    const u = await User.create({ tenantId: TENANT, name: "Finance User", email: `f-${Date.now()}-${Math.random()}@example.com`, phone: "9999999999", password: "hashed", role: "finance", status: "active" });
    return String(u._id);
  }

  async function makeSchedule(debitAccountId: string, creditAccountId: string, periods: { periodKey: string; dueDate: Date; amount: number; status: string; draftedAt?: Date }[]) {
    return AiSchedule.create({
      tenantId: TENANT,
      scheduleType: "prepaid",
      sourceRef: { model: "Invoice", id: new mongoose.Types.ObjectId().toString() },
      status: "approved",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      frequency: "monthly",
      totalAmount: periods.reduce((s, p) => s + p.amount, 0),
      currency: "INR",
      debitAccountId,
      creditAccountId,
      basis: "stated",
      periods,
      recognisedToDate: 0,
      remaining: periods.reduce((s, p) => s + p.amount, 0),
      createdByWorkflow: "AI-08",
    });
  }

  function postJournalArgs(scheduleId: string, periodKey: string, amount: number, debitAccountId: string, creditAccountId: string, userId: string) {
    return {
      tenantId: TENANT,
      createdBy: userId,
      scheduleId,
      periodKey,
      header: { journalType: "general" as const, date: new Date("2026-02-15") },
      lineIds: [
        { accountId: debitAccountId, label: "line", debit: amount, credit: 0 },
        { accountId: creditAccountId, label: "line", debit: 0, credit: amount },
      ],
      allowNonStandard: true,
      overrideReason: "test fixture",
    };
  }

  it("a normal post_journal call still posts cleanly (baseline, unchanged behavior)", async () => {
    const debit = await makeAccount("expense");
    const credit = await makeAccount("asset_prepayments");
    const schedule = await makeSchedule(debit, credit, [{ periodKey: "2026-01", dueDate: new Date("2026-01-31"), amount: 1000, status: "pending" }]);

    const userId = await makeUser();
    const { result } = await callTool<{ journalEntryId: string }>("post_journal", postJournalArgs(String(schedule._id), "2026-01", 1000, debit, credit, userId), { tenantId: TENANT, runId: "run-1", userId, requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS });

    expect(result.journalEntryId).toBeDefined();
    const updated = await AiSchedule.findById(schedule._id).lean();
    expect(updated!.periods[0].status).toBe("posted");
    const entry = await JournalEntry.findById(result.journalEntryId).lean();
    expect(entry!.header.ref).toBe(`ai-schedule:${schedule._id}:2026-01`);
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(1);
  });

  it("a period stuck at DRAFTED (simulated crash, no journal entry) throws on retry — never silently double-posts", async () => {
    const debit = await makeAccount("expense");
    const credit = await makeAccount("asset_prepayments");
    const schedule = await makeSchedule(debit, credit, [{ periodKey: "2026-02", dueDate: new Date("2026-02-28"), amount: 1000, status: "pending" }]);

    // Simulate exactly what post_journal's own CAS leaves behind if the process dies right after
    // it, before any JournalEntry is created — the real crash window this fix closes.
    await AiSchedule.updateOne(
      { _id: schedule._id, "periods.periodKey": "2026-02" },
      { $set: { "periods.$.status": AI_SCHEDULE_PERIOD_STATUS.DRAFTED, "periods.$.draftedAt": new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    );
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(0);

    const userId = await makeUser();
    await expect(callTool("post_journal", postJournalArgs(String(schedule._id), "2026-02", 1000, debit, credit, userId), { tenantId: TENANT, runId: "run-2", userId, requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS })).rejects.toThrow(PeriodAlreadyPostedError);

    // The real point of this test: zero journal entries were created by the retry, not one.
    expect(await JournalEntry.countDocuments({ tenantId: TENANT })).toBe(0);
    const stillStuck = await AiSchedule.findById(schedule._id).lean();
    expect(stillStuck!.periods[0].status).toBe("drafted");
  });

  it("findStuckSchedulePeriods() detects a period stuck past the grace window, and not one still genuinely in flight", async () => {
    const debit = await makeAccount("expense");
    const credit = await makeAccount("asset_prepayments");
    const schedule = await makeSchedule(debit, credit, [
      { periodKey: "2026-03", dueDate: new Date("2026-03-31"), amount: 1000, status: "drafted", draftedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }, // 2h ago — stuck
      { periodKey: "2026-04", dueDate: new Date("2026-04-30"), amount: 1000, status: "drafted", draftedAt: new Date(Date.now() - 30 * 1000) }, // 30s ago — genuinely mid-flight
    ]);

    const issues = await findStuckSchedulePeriods(TENANT);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ scheduleId: String(schedule._id), periodKey: "2026-03" });
  });

  it("recover_stuck_schedule_period resets to PENDING when no journal entry was ever created, and a fresh post still only creates exactly one", async () => {
    const debit = await makeAccount("expense");
    const credit = await makeAccount("asset_prepayments");
    const schedule = await makeSchedule(debit, credit, [{ periodKey: "2026-05", dueDate: new Date("2026-05-31"), amount: 1000, status: "drafted", draftedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }]);

    const { result } = await callTool<{ repaired: boolean; reason: string }>("recover_stuck_schedule_period", { tenantId: TENANT, scheduleId: String(schedule._id), periodKey: "2026-05" }, { tenantId: TENANT, runId: "run-3", requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS });

    expect(result.repaired).toBe(true);
    expect(result.reason).toContain("reset to pending");
    const afterRecovery = await AiSchedule.findById(schedule._id).lean();
    expect(afterRecovery!.periods[0].status).toBe("pending");

    // A fresh post_journal call now succeeds cleanly — exactly one journal entry, not zero, not two.
    const userId = await makeUser();
    await callTool("post_journal", postJournalArgs(String(schedule._id), "2026-05", 1000, debit, credit, userId), { tenantId: TENANT, runId: "run-4", userId, requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS });
    expect(await JournalEntry.countDocuments({ tenantId: TENANT, "header.ref": `ai-schedule:${schedule._id}:2026-05` })).toBe(1);
  });

  it("recover_stuck_schedule_period links the journal entry that was already created before the crash, without creating a second one", async () => {
    const debit = await makeAccount("expense");
    const credit = await makeAccount("asset_prepayments");
    const schedule = await makeSchedule(debit, credit, [{ periodKey: "2026-06", dueDate: new Date("2026-06-30"), amount: 1500, status: "drafted", draftedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }]);

    // Simulate the OTHER crash window: JournalEntry.create() succeeded, but the process died
    // before the schedule's own claimed.save() ran — the entry exists, tagged with the
    // deterministic ref, but the period never got linked/marked posted.
    const orphanEntry = await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-orphan", date: new Date("2026-06-15"), journalType: "general", ref: `ai-schedule:${schedule._id}:2026-06` },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: debit, label: "line", debit: 1500, credit: 0 },
        { accountId: credit, label: "line", debit: 0, credit: 1500 },
      ],
      totals: { amountUntaxed: 1500, amountTax: 0, amountTotal: 1500 },
    });

    const { result } = await callTool<{ repaired: boolean; reason: string }>("recover_stuck_schedule_period", { tenantId: TENANT, scheduleId: String(schedule._id), periodKey: "2026-06" }, { tenantId: TENANT, runId: "run-5", requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS });

    expect(result.repaired).toBe(true);
    expect(result.reason).toContain("linked the journal entry");
    const afterRecovery = await AiSchedule.findById(schedule._id).lean();
    expect(afterRecovery!.periods[0].status).toBe("posted");
    expect(String(afterRecovery!.periods[0].journalEntryId)).toBe(String(orphanEntry._id));
    expect(afterRecovery!.recognisedToDate).toBe(1500);
    // The orphan entry was linked, never duplicated.
    expect(await JournalEntry.countDocuments({ tenantId: TENANT, "header.ref": `ai-schedule:${schedule._id}:2026-06` })).toBe(1);
  });

  it("recover_stuck_schedule_period is a no-op, not an error, when the period is not actually stuck", async () => {
    const debit = await makeAccount("expense");
    const credit = await makeAccount("asset_prepayments");
    const schedule = await makeSchedule(debit, credit, [{ periodKey: "2026-07", dueDate: new Date("2026-07-31"), amount: 1000, status: "pending" }]);

    const { result } = await callTool<{ repaired: boolean; reason: string }>("recover_stuck_schedule_period", { tenantId: TENANT, scheduleId: String(schedule._id), periodKey: "2026-07" }, { tenantId: TENANT, runId: "run-6", requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS });

    expect(result.repaired).toBe(true);
    expect(result.reason).toContain("not stuck");
    const unchanged = await AiSchedule.findById(schedule._id).lean();
    expect(unchanged!.periods[0].status).toBe("pending");
  });
});

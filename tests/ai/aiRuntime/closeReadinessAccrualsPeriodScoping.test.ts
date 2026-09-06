import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_closereadiness_period_scoping";

import AiSchedule, { AI_SCHEDULE_TYPE, AI_SCHEDULE_STATUS, AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";

let computeCloseReadiness: typeof import("@/lib/aiRuntime/closeReadiness/compute").computeCloseReadiness;

const TENANT = "close-readiness-period-scoping-tenant";

/**
 * Chunk 10a addendum, Part 1.2 — the wall-clock-vs-tenant-period sweep. `checkAccrualsDomain()`
 * and `checkPrepaidsDomain()` (lib/aiRuntime/closeReadiness/domains.ts) used to compare an
 * AiSchedule's pending-period `dueDate` against wall-clock `new Date()`, even though every sibling
 * domain in the same file (checkBankDomain, checkArDomain, the prepaid domain's OWN reconciliation
 * half) is scoped to the `periodEnd` the caller already passed in. That made "is this stale" answer
 * a different question depending on when `computeCloseReadiness()` happens to run, not what period
 * it was asked about — reachable for real via `lib/aiRuntime/statements/annotateStatement.ts`
 * (AI-18/AI-21), which calls `computeCloseReadiness()` for a `period` that is not always "now".
 *
 * This fixture makes the two diverge on purpose: a pending accrual-reversal period due AFTER the
 * historical period being closed, but BEFORE today's real wall-clock date. The old, wall-clock-
 * scoped code would wrongly call it "stale" (not yet due as of that period, but overdue by today's
 * clock); the fixed, `periodEnd`-scoped code must not.
 */
describe("computeCloseReadiness — accruals/prepaids domains are scoped to periodEnd, not wall-clock now (Chunk 10a, Part 1.2)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await AiSchedule.init();
    ({ computeCloseReadiness } = await import("@/lib/aiRuntime/closeReadiness/compute"));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await AiSchedule.deleteMany({});
  });

  it("a pending reversal due after a historical period's end is NOT flagged stale for that period, even though it is overdue by today's real clock", async () => {
    // A historical close: January 2026. Its own periodEnd is long past relative to real "today"
    // (2026-09-06, per this session), but the schedule's pending period is due in February 2026 —
    // after January's periodEnd, so NOT stale as of January's close, even though Feb 2026 is also
    // before today's real wall-clock date.
    const period = "2026-01";
    const periodEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59));
    const dueAfterPeriodEndButBeforeToday = new Date(Date.UTC(2026, 1, 15)); // 2026-02-15

    await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: AI_SCHEDULE_TYPE.ACCRUAL_REVERSAL,
      sourceRef: { model: "PurchaseOrder", id: new mongoose.Types.ObjectId().toString() },
      status: AI_SCHEDULE_STATUS.APPROVED,
      startDate: periodEnd,
      endDate: dueAfterPeriodEndButBeforeToday,
      frequency: "monthly",
      totalAmount: 5000,
      currency: "INR",
      debitAccountId: new mongoose.Types.ObjectId(),
      creditAccountId: new mongoose.Types.ObjectId(),
      basis: "inferred",
      periods: [{ periodKey: "2026-02", dueDate: dueAfterPeriodEndButBeforeToday, amount: 5000, status: AI_SCHEDULE_PERIOD_STATUS.PENDING }],
      recognisedToDate: 0,
      remaining: 5000,
      createdByWorkflow: "AI-07",
    });

    const computation = await computeCloseReadiness(TENANT, period, periodEnd);
    const accrualsDomain = computation.domains.find((d) => d.domain === "accruals");
    expect(accrualsDomain, "accruals domain must exist in the computation").toBeDefined();

    const staleBlocker = accrualsDomain!.blockers.find((b) => b.id.startsWith("accruals-stale-"));
    expect(
      staleBlocker,
      "a reversal due AFTER the period being closed must not be reported as a stale/overdue blocker FOR THAT PERIOD, regardless of whether it is also before today's real wall-clock date",
    ).toBeUndefined();
  });

  it("the same pending reversal IS flagged stale once periodEnd itself moves past its due date", async () => {
    const period = "2026-03";
    const periodEnd = new Date(Date.UTC(2026, 2, 31, 23, 59, 59)); // 2026-03-31, after the Feb 15 due date
    const dueDate = new Date(Date.UTC(2026, 1, 15)); // 2026-02-15

    await AiSchedule.create({
      tenantId: TENANT,
      scheduleType: AI_SCHEDULE_TYPE.ACCRUAL_REVERSAL,
      sourceRef: { model: "PurchaseOrder", id: new mongoose.Types.ObjectId().toString() },
      status: AI_SCHEDULE_STATUS.APPROVED,
      startDate: dueDate,
      endDate: periodEnd,
      frequency: "monthly",
      totalAmount: 5000,
      currency: "INR",
      debitAccountId: new mongoose.Types.ObjectId(),
      creditAccountId: new mongoose.Types.ObjectId(),
      basis: "inferred",
      periods: [{ periodKey: "2026-02", dueDate, amount: 5000, status: AI_SCHEDULE_PERIOD_STATUS.PENDING }],
      recognisedToDate: 0,
      remaining: 5000,
      createdByWorkflow: "AI-07",
    });

    const computation = await computeCloseReadiness(TENANT, period, periodEnd);
    const accrualsDomain = computation.domains.find((d) => d.domain === "accruals");
    const staleBlocker = accrualsDomain!.blockers.find((b) => b.id.startsWith("accruals-stale-"));
    expect(staleBlocker, "a reversal due before the period being closed's own end must be flagged stale for that period").toBeDefined();
    expect(staleBlocker!.ageDays).toBe(44); // Feb 15 00:00 -> Mar 31 23:59:59 UTC, floor-divided, computed against periodEnd, not wall-clock "today"
  });
});

import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import mongoose from "mongoose";

process.env.MONGODB_URI = "mongodb://localhost:27017/aupulens_test_reports_todateend";

import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import { buildPostedJournalReport } from "@/lib/accounting/reports";

const TENANT = "reports-todateend-tenant";

/**
 * Chunk 10a addendum, Part 1.2 (three-pinned-date sweep) — `buildPostedJournalReport()`'s
 * `endDate` filter used to run through `toDateEnd()`, which called LOCAL `Date.setHours(23,59,
 * 59,999)` on an already-UTC-constructed boundary (every caller in lib/aiRuntime/** builds period
 * bounds with `Date.UTC(...)`). On a server east of UTC (this dev box: IST, UTC+5:30), a UTC
 * instant like 2026-01-31T23:59:59.999Z is already 2026-02-01 in local time, so `setHours` pushed
 * the effective upper bound to 2026-02-01T18:29:59.999Z — silently pulling up to ~18.5 hours of
 * the NEXT month into a "prior month" report query. Found via AI-14's own trigger-proof test
 * failing when wall-clock time was pinned to 2026-02-01T00:00:00Z (docs/ai/BRIEF-10a-ADDENDUM.md
 * Part 1.2): a journal entry posted at that exact instant leaked into a January query.
 *
 * This test reproduces the leak directly against `buildPostedJournalReport()` with fixed calendar
 * dates (no wall-clock faking needed — the bug is a pure, TZ-dependent date-range defect,
 * independent of "now") so it fails on this dev box under the old `setHours` code and passes
 * under the fix (`setUTCHours`) in any timezone, since a UTC-normalized comparison is TZ-invariant.
 */
describe("buildPostedJournalReport — endDate boundary is UTC-normalized, not shifted by server timezone (Chunk 10a, Part 1.2)", () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
    await Promise.all([Account.init(), JournalEntry.init()]);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  afterEach(async () => {
    await Promise.all([Account.deleteMany({}), JournalEntry.deleteMany({})]);
  });

  it("an entry dated at the first UTC instant of February never appears in a report queried for January's UTC range", async () => {
    const expenseAcc = await Account.create({ tenantId: TENANT, name: "Expense", code: "ACC-EXP", account_type: "expense", internal_group: "expense", isActive: true, isLocked: false, status: "active" });
    const cashAcc = await Account.create({ tenantId: TENANT, name: "Cash", code: "ACC-CASH", account_type: "income", internal_group: "asset", isActive: true, isLocked: false, status: "active" });

    const firstInstantOfFebruary = new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0));
    await JournalEntry.create({
      tenantId: TENANT,
      header: { name: "JE-FEB-1", date: firstInstantOfFebruary, journalType: "general" },
      status: "posted",
      voucherStatus: "posted",
      lineIds: [
        { accountId: expenseAcc._id, label: "line", debit: 50000, credit: 0 },
        { accountId: cashAcc._id, label: "line", debit: 0, credit: 50000 },
      ],
      totals: { amountUntaxed: 50000, amountTax: 0, amountTotal: 50000 },
    });

    const januaryStart = new Date(Date.UTC(2026, 0, 1, 0, 0, 0, 0));
    const januaryEnd = new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999));
    const januaryReport = await buildPostedJournalReport({ tenantId: TENANT, startDate: januaryStart, endDate: januaryEnd });

    expect(
      Object.keys(januaryReport.expense.accounts),
      "the February-dated entry must not appear in a report scoped to January's UTC range, regardless of the server's local timezone",
    ).toHaveLength(0);

    const februaryStart = new Date(Date.UTC(2026, 1, 1, 0, 0, 0, 0));
    const februaryEnd = new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999));
    const februaryReport = await buildPostedJournalReport({ tenantId: TENANT, startDate: februaryStart, endDate: februaryEnd });
    expect(Object.keys(februaryReport.expense.accounts), "the entry must still be found in its own real month's query").toHaveLength(1);
  });
});

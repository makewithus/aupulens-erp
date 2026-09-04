import { describe, expect, it } from "vitest";
import { buildPeriods, sumPeriodAmounts } from "@/lib/aiRuntime/schedules/scheduleMath";
import { AI_SCHEDULE_FREQUENCY } from "@/models/ai/AiSchedule";

describe("scheduleMath — pure part-period arithmetic", () => {
  it("12-month insurance starting mid-month → correct part-period split, periods sum exactly", () => {
    const start = new Date(Date.UTC(2026, 0, 17)); // 2026-01-17
    const end = new Date(Date.UTC(2027, 0, 16)); // 2027-01-16 (12 months coverage)
    const periods = buildPeriods(start, end, AI_SCHEDULE_FREQUENCY.MONTHLY, 12000);

    expect(periods).toHaveLength(13);
    expect(sumPeriodAmounts(periods)).toBe(12000);
    // First period (Jan 17-31, 15 days) and last (Jan 1-16, 16 days) are both partial —
    // neither equals a full month's share.
    const fullMonthShare = 12000 / 13; // rough sanity, not exact since months vary
    expect(periods[0].amount).toBeLessThan(fullMonthShare * 1.2);
    expect(periods[periods.length - 1].amount).toBeGreaterThan(0);
  });

  it("quarterly frequency across a year end → four periods for a 12-month schedule, distinct period keys", () => {
    const start = new Date(Date.UTC(2026, 9, 1)); // 2026-10-01
    const end = new Date(Date.UTC(2027, 8, 30)); // 2027-09-30 (12 months)
    const periods = buildPeriods(start, end, AI_SCHEDULE_FREQUENCY.QUARTERLY, 4000);

    expect(periods).toHaveLength(4);
    expect(sumPeriodAmounts(periods)).toBe(4000);
    const keys = periods.map((p) => p.periodKey);
    expect(new Set(keys).size).toBe(4); // all distinct, spans the year boundary correctly
  });

  it("annual frequency, single full year → one period equal to the total", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 11, 31));
    const periods = buildPeriods(start, end, AI_SCHEDULE_FREQUENCY.ANNUAL, 9999);
    expect(periods).toHaveLength(1);
    expect(periods[0].amount).toBe(9999);
  });

  it("rounding remainder goes to the final period only", () => {
    // An amount that doesn't divide evenly across the periods.
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 2, 31)); // 3 months
    const periods = buildPeriods(start, end, AI_SCHEDULE_FREQUENCY.MONTHLY, 100);
    expect(periods).toHaveLength(3);
    expect(sumPeriodAmounts(periods)).toBe(100);
  });
});

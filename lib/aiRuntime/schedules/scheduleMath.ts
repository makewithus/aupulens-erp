import type { AiScheduleFrequency } from "@/models/ai/AiSchedule";
import type { IAiSchedulePeriod } from "@/models/ai/AiSchedule";
import { AI_SCHEDULE_FREQUENCY, AI_SCHEDULE_PERIOD_STATUS } from "@/models/ai/AiSchedule";

/**
 * Pure schedule arithmetic (docs/ai/BRIEF-03-BATCH-B.md B.1) — no DB, no model calls, fully
 * unit-testable. Two invariants this module exists to guarantee:
 *   1. sum(periods[].amount) === totalAmount, exactly, to the smallest currency unit — the
 *      rounding remainder goes to the FINAL period, never spread.
 *   2. Part-period arithmetic is explicit day-count proration on actual month lengths, not a
 *      naive equal split.
 */

const MONTHS_PER_BUCKET: Record<AiScheduleFrequency, number> = {
  [AI_SCHEDULE_FREQUENCY.MONTHLY]: 1,
  [AI_SCHEDULE_FREQUENCY.QUARTERLY]: 3,
  [AI_SCHEDULE_FREQUENCY.ANNUAL]: 12,
};

/** The last day of the calendar bucket (month/quarter/year) containing `date`, aligned to real
 *  calendar boundaries (e.g. monthly buckets are calendar months, not "this day-of-month to the
 *  same day next month") — this is what makes a 12-month policy starting on the 17th produce a
 *  genuinely partial first bucket (17th–end of that month), not an artificially-shifted one. */
function calendarBucketEnd(date: Date, monthsPerBucket: number): Date {
  const bucketIndex = Math.floor(date.getUTCMonth() / monthsPerBucket);
  const bucketEndMonthExclusive = (bucketIndex + 1) * monthsPerBucket;
  const boundary = new Date(Date.UTC(date.getUTCFullYear(), bucketEndMonthExclusive, 1));
  return new Date(boundary.getTime() - 24 * 60 * 60 * 1000);
}

function nextDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function daysBetweenInclusive(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((b.getTime() - a.getTime()) / msPerDay) + 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function periodKeyFor(bucketStart: Date, frequency: AiScheduleFrequency): string {
  const year = bucketStart.getUTCFullYear();
  const month = bucketStart.getUTCMonth(); // 0-11
  if (frequency === AI_SCHEDULE_FREQUENCY.ANNUAL) return `${year}`;
  if (frequency === AI_SCHEDULE_FREQUENCY.QUARTERLY) return `${year}-Q${Math.floor(month / 3) + 1}`;
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export interface BuildPeriodsResult {
  periods: IAiSchedulePeriod[];
  totalAmount: number;
}

/**
 * Builds the period breakdown for [startDate, endDate] at the given frequency, day-count
 * proportioned against `totalAmount`. Buckets are chunked forward from `startDate` in
 * `frequency`-month increments (not necessarily calendar-aligned) — a 12-month/quarterly
 * schedule always produces exactly 4 buckets regardless of starting month.
 */
export function buildPeriods(
  startDate: Date,
  endDate: Date,
  frequency: AiScheduleFrequency,
  totalAmount: number,
): IAiSchedulePeriod[] {
  const totalDays = daysBetweenInclusive(startDate, endDate);
  const dailyRate = totalAmount / totalDays;
  const monthsPerBucket = MONTHS_PER_BUCKET[frequency];

  const buckets: { start: Date; end: Date }[] = [];
  let cursor = new Date(startDate);
  while (cursor.getTime() <= endDate.getTime()) {
    const bucketStart = new Date(cursor);
    const calendarEnd = calendarBucketEnd(cursor, monthsPerBucket);
    const bucketEnd = calendarEnd.getTime() > endDate.getTime() ? new Date(endDate) : calendarEnd;
    buckets.push({ start: bucketStart, end: bucketEnd });
    cursor = nextDay(bucketEnd);
  }

  const periods: IAiSchedulePeriod[] = buckets.map((b) => {
    const daysInBucket = daysBetweenInclusive(b.start, b.end);
    return {
      periodKey: periodKeyFor(b.start, frequency),
      dueDate: b.end,
      amount: round2(dailyRate * daysInBucket),
      status: AI_SCHEDULE_PERIOD_STATUS.PENDING,
    };
  });

  // Invariant 1: the rounding remainder goes to the FINAL period, never spread.
  const sumExceptLast = periods.slice(0, -1).reduce((s, p) => s + p.amount, 0);
  if (periods.length > 0) {
    periods[periods.length - 1].amount = round2(totalAmount - sumExceptLast);
  }

  return periods;
}

/** Sums to the smallest currency unit — used by both the builder and tests/callers asserting
 *  invariant 1 holds. */
export function sumPeriodAmounts(periods: IAiSchedulePeriod[]): number {
  return round2(periods.reduce((s, p) => s + p.amount, 0));
}

/**
 * Straight-line depreciation periods at a FIXED monthly rate — unlike `buildPeriods` (which
 * divides a known total evenly across a span), depreciation is rate-driven: the per-period
 * amount is `lib/accounting/depreciation.ts::computeMonthlyDepreciation()`'s figure, held
 * constant, not derived from dividing totalDepreciable by a period count. The first period is
 * day-count pro-rated from `purchaseDate` to that month's end (AiSchedule invariant 2 — mid-month
 * acquisitions produce a genuinely partial first period); every full month after that posts the
 * flat monthly rate; the final period absorbs whatever's left so accumulated depreciation never
 * overshoots `totalDepreciable` (invariant 1).
 */
export function buildDepreciationPeriods(purchaseDate: Date, monthlyRate: number, totalDepreciable: number): IAiSchedulePeriod[] {
  if (monthlyRate <= 0 || totalDepreciable <= 0) return [];
  const periods: IAiSchedulePeriod[] = [];
  let remaining = totalDepreciable;
  let cursor = new Date(purchaseDate);

  while (remaining > 0.005) {
    const monthEnd = calendarBucketEnd(cursor, 1);
    const daysInMonth = daysBetweenInclusive(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)), monthEnd);
    const daysActive = daysBetweenInclusive(cursor, monthEnd);
    const isFirstPeriod = periods.length === 0;
    const rawAmount = isFirstPeriod ? monthlyRate * (daysActive / daysInMonth) : monthlyRate;
    const amount = round2(Math.min(rawAmount, remaining));
    periods.push({
      periodKey: periodKeyFor(cursor, AI_SCHEDULE_FREQUENCY.MONTHLY),
      dueDate: monthEnd,
      amount,
      status: AI_SCHEDULE_PERIOD_STATUS.PENDING,
    });
    remaining = round2(remaining - amount);
    cursor = nextDay(monthEnd);
  }

  const sumExceptLast = periods.slice(0, -1).reduce((s, p) => s + p.amount, 0);
  if (periods.length > 0) {
    periods[periods.length - 1].amount = round2(totalDepreciable - sumExceptLast);
  }

  return periods;
}

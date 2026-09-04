import { differenceInCalendarDays } from "date-fns";

/**
 * AI-15's timing-family patterns (Chunk 5) — extracted per docs/ai/BRIEF-07-BATCH-F.md A.3 so
 * AI-23 consumes the identical signal rather than re-deriving it. AI-15's own workflow wraps
 * these exact functions (a behaviour-preserving refactor).
 */

export function isWeekendOrAfterHours(createdAt: Date): { flagged: boolean; isWeekend: boolean; isAfterHours: boolean; hour: number } {
  const day = createdAt.getUTCDay();
  const hour = createdAt.getUTCHours();
  const isWeekend = day === 0 || day === 6;
  const isAfterHours = hour < 7 || hour >= 21;
  return { flagged: isWeekend || isAfterHours, isWeekend, isAfterHours, hour };
}

export function backdatedDays(createdAt: Date, entryDate: Date): number {
  return differenceInCalendarDays(createdAt, entryDate);
}

export const BACKDATED_THRESHOLD_DAYS = 7;

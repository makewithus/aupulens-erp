/**
 * AI usage tracking helpers — single source of truth for period calculation,
 * cap reads, and incrementing.
 *
 * Reset boundary: UTC calendar month.  A call at 2026-01-31 23:59 UTC counts
 * in period "202601"; the next call at 2026-02-01 00:00 UTC is in "202602"
 * (fresh counter starting at 0).
 *
 * Increment policy: ONLY on successful Claude responses.  Gated requests
 * (AI_DISABLED, AI_LIMIT_REACHED) and failed Claude calls (API errors,
 * network timeouts) must NOT call incrementAiUsage.
 */

import connectDB from "@/lib/db";
import AiUsage from "@/models/AiUsage";

/**
 * Returns the UTC calendar-month period string "YYYYMM" for the given (or current) date.
 * Used as the partition key for per-tenant usage counters.
 */
export function getAiPeriod(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

/**
 * Returns the current successful-call count for a tenant in the given period.
 * Returns 0 when no document exists yet (first call of the month).
 */
export async function getAiUsageCount(tenantId: string, period: string): Promise<number> {
  await connectDB();
  const doc = await AiUsage.findOne({ tenantId, period }, { count: 1 }).lean<{ count: number }>();
  return doc?.count ?? 0;
}

/**
 * Atomically increments the usage counter by 1.
 * Creates the document on first call of the month (upsert).
 * Must only be called after a successful Claude API response.
 */
export async function incrementAiUsage(tenantId: string, period: string): Promise<void> {
  await connectDB();
  await AiUsage.findOneAndUpdate(
    { tenantId, period },
    { $inc: { count: 1 } },
    { upsert: true }
  );
}

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
import AiUsage from "@/models/admin/AiUsage";

/**
 * Reserved tenantId used to track PLATFORM-WIDE (all-tenants-combined) usage
 * for the global monthly ceiling. It is not a real subdomain, so it can never
 * collide with a tenant. Incremented alongside the per-tenant counter on every
 * successful call; read by the AI_GLOBAL_MONTHLY_CAP backstop.
 */
export const PLATFORM_TENANT_ID = "__platform__";

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

/**
 * Global monthly ceiling that sits ABOVE the per-tenant tier caps — a hard
 * platform-wide backstop against runaway cost during the paid trial (a bad
 * loop hammering AI, or many tenants active at once). Deliberately NOT a tier
 * downgrade: several enterprise-tier tenants may be real workspaces we can't
 * distinguish from test orgs, so we never touch their tier — this ceiling is
 * orthogonal and applies to everyone combined.
 *
 * Value derivation (see PROGRESS.md "AI_GLOBAL_MONTHLY_CAP" section for the
 * full math). Defaults to 17000 calls/month if the env var is unset/invalid.
 */
export function getGlobalMonthlyCap(): number {
  const raw = process.env.AI_GLOBAL_MONTHLY_CAP;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 17000;
}

/**
 * Current platform-wide successful-call count for the period (all tenants
 * combined). Read from the reserved PLATFORM_TENANT_ID counter, so this stays
 * O(1) rather than aggregating across every tenant on each call.
 */
export async function getGlobalAiUsageCount(period: string): Promise<number> {
  return getAiUsageCount(PLATFORM_TENANT_ID, period);
}

/**
 * Increment the platform-wide counter. Called alongside the per-tenant
 * increment on every successful call so the global ceiling stays accurate.
 */
export async function incrementGlobalAiUsage(period: string): Promise<void> {
  return incrementAiUsage(PLATFORM_TENANT_ID, period);
}

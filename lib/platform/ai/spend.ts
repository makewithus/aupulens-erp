import connectDB from "@/lib/db";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AiLimit from "@/models/platform/AiLimit";

/**
 * Combined spend (Azure OpenAI + Sarvam) for a tenant this UTC month, from the SAME AiUsageRecord
 * rows the dashboards read. Used to stop paid TRANSLATION once a tenant has reached its configured
 * `maxCostUsdPerMonth` — so a tenant at its limit does not get unlimited translation.
 *
 * Scope note: this gates only the new Sarvam calls. Azure calls keep exactly the limit behaviour
 * they had before (call-count cap + at-limit behaviour); the cost cap was stored but never
 * enforced for them, and changing that is a product decision, not part of this feature.
 * Fails open: any error ⇒ "not reached" (an accounting hiccup must not break the assistant).
 */
const cache = new Map<string, { at: number; costUsd: number; cap: number | null }>();
const TTL_MS = 60_000;

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };

export async function getCombinedMonthCost(tenantId: string): Promise<{ costUsd: number; cap: number | null }> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return { costUsd: hit.costUsd, cap: hit.cap };
  await connectDB();
  const [agg, limit] = await Promise.all([
    AiUsageRecord.aggregate([
      { $match: { tenantId, createdAt: { $gte: monthStart() } } },
      { $group: { _id: null, cost: { $sum: "$estimatedCostUsd" } } },
    ]),
    AiLimit.findOne({ tenantId }, { maxCostUsdPerMonth: 1 }).lean<{ maxCostUsdPerMonth?: number }>(),
  ]);
  const value = { costUsd: agg[0]?.cost ?? 0, cap: typeof limit?.maxCostUsdPerMonth === "number" && limit.maxCostUsdPerMonth > 0 ? limit.maxCostUsdPerMonth : null };
  cache.set(tenantId, { at: Date.now(), ...value });
  return value;
}

export async function costCapReached(tenantId: string): Promise<boolean> {
  try {
    const { costUsd, cap } = await getCombinedMonthCost(tenantId);
    return cap !== null && costUsd >= cap;
  } catch {
    return false;
  }
}

export const clearSpendCache = () => cache.clear();

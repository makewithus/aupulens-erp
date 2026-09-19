import connectDB from "@/lib/db";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import AiUsageDaily from "@/models/platform/AiUsageDaily";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import Organization from "@/models/admin/Organization";
import { getProviderBreakdown } from "./providerBreakdown";
import { isAiUsageRollupStale } from "./rollupFreshness";
import { getAiPeriod } from "@/lib/ai/usage";
import { ADMIN_CAPABILITY, PLATFORM_EVENT_TYPE } from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { withCrossTenantRead } from "@/lib/platform/tenancy/crossTenant";

function previousMonthPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  const prev = new Date(Date.UTC(year, month - 2, 1));
  return getAiPeriod(prev);
}

/**
 * Source doc §13's platform-wide AI dashboard. Reads ONLY from the
 * AiUsageMonthly rollup — never AiUsageRecord directly (load-time). Every
 * figure is real; a fresh platform with no rollup rows yet shows real
 * zeros, not a placeholder.
 */
export async function getPlatformAiUsageSummary(actor: AdminActor, reason: string) {
  return withCrossTenantRead({
    actor,
    capability: ADMIN_CAPABILITY.VIEW_AI_USAGE,
    reason,
    eventType: PLATFORM_EVENT_TYPE.CROSS_TENANT_READ,
    entityType: "AiUsageMonthly",
    run: async () => {
      await connectDB();
      const thisMonth = getAiPeriod();
      const lastMonth = previousMonthPeriod(thisMonth);
      const today = new Date().toISOString().slice(0, 10);
      const rollupStale = await isAiUsageRollupStale();

      // "This month" begin, UTC — used only for the topModels query below,
      // which reads AiUsageRecord directly (see that query's own comment
      // for why, unlike every other figure here which reads the rollups).
      const monthStart = new Date(
        Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(4, 6)) - 1, 1),
      );

      const [thisMonthRows, allTimeRows, lastMonthRows, todayRows, byOrg, byFeature, byModel] = await Promise.all([
        AiUsageMonthly.aggregate([
          { $match: { period: thisMonth } },
          {
            $group: {
              _id: null,
              requestCount: { $sum: "$requestCount" },
              inputTokens: { $sum: "$inputTokens" },
              outputTokens: { $sum: "$outputTokens" },
              estimatedCostUsd: { $sum: "$estimatedCostUsd" },
              errorCount: { $sum: "$errorCount" },
            },
          },
        ]),
        // §13's "Total AI Requests" — distinct from "This Month" below, an
        // all-time figure across every period this rollup has ever recorded.
        AiUsageMonthly.aggregate([{ $group: { _id: null, requestCount: { $sum: "$requestCount" } } }]),
        AiUsageMonthly.aggregate([
          { $match: { period: lastMonth } },
          { $group: { _id: null, requestCount: { $sum: "$requestCount" } } },
        ]),
        AiUsageDaily.aggregate([
          { $match: { period: today } },
          { $group: { _id: null, requestCount: { $sum: "$requestCount" } } },
        ]),
        AiUsageMonthly.aggregate([
          { $match: { period: thisMonth } },
          { $group: { _id: "$tenantId", requestCount: { $sum: "$requestCount" }, estimatedCostUsd: { $sum: "$estimatedCostUsd" } } },
          { $sort: { requestCount: -1 } },
          { $limit: 5 },
        ]),
        AiUsageMonthly.aggregate([
          { $match: { period: thisMonth } },
          { $group: { _id: "$feature", requestCount: { $sum: "$requestCount" } } },
          { $sort: { requestCount: -1 } },
        ]),
        // §13's "Top Models" — a genuinely separate metric from "Top
        // Features" above (model name, e.g. gpt-4o, vs. feature bucket, e.g.
        // ai_assistant). The AiUsageMonthly/AiUsageDaily rollups deliberately
        // don't carry a modelName field (this dashboard's own long-standing
        // rule is to read the rollups, never AiUsageRecord, at load time) —
        // adding one would mean widening the rollup's unique index
        // (tenantId+period+feature) to include modelName, a real schema
        // migration affecting Phase 4's tested aggregation logic and every
        // existing rollup row, for one dashboard tile. Reading AiUsageRecord
        // directly, bounded to "this month" (the same window every other
        // figure here already uses) and backed by the pre-existing
        // `{ createdAt: -1 }` index, is the smaller, safer change — this is
        // an admin dashboard read, not a per-tenant-request hot path.
        AiUsageRecord.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          { $group: { _id: "$modelName", requestCount: { $sum: 1 } } },
          { $sort: { requestCount: -1 } },
          { $limit: 5 },
        ]),
      ]);

      const providerBreakdown = await getProviderBreakdown(monthStart);

      const orgSubdomains = byOrg.map((o) => o._id as string);
      const orgs = await Organization.find({ subdomain: { $in: orgSubdomains } }, "subdomain name").lean();
      const orgNameMap = new Map(orgs.map((o) => [o.subdomain, o.name]));

      let totals = thisMonthRows[0] ?? {
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        errorCount: 0,
      };

      // Phase 10 Part 0.4: this month's TOTAL figures (not the top-N
      // breakdowns below, which stay on the rollup — see
      // docs/admin/SCHEDULED_WORK.md for the scope boundary) fall back to a
      // live AiUsageRecord computation when the rollup job hasn't run
      // recently, rather than silently showing an old number as current.
      if (rollupStale) {
        const liveRows = await AiUsageRecord.aggregate([
          { $match: { createdAt: { $gte: monthStart } } },
          {
            $group: {
              _id: null,
              requestCount: { $sum: 1 },
              inputTokens: { $sum: "$inputTokens" },
              outputTokens: { $sum: "$outputTokens" },
              estimatedCostUsd: { $sum: "$estimatedCostUsd" },
              errorCount: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
            },
          },
        ]);
        totals = liveRows[0] ?? { requestCount: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, errorCount: 0 };
      }

      return {
        thisMonthDataSource: rollupStale ? ("live" as const) : ("rollup" as const),
        totalRequestsAllTime: allTimeRows[0]?.requestCount ?? 0,
        totalRequestsThisMonth: totals.requestCount,
        totalRequestsToday: todayRows[0]?.requestCount ?? 0,
        totalRequestsPreviousMonth: lastMonthRows[0]?.requestCount ?? 0,
        totalInputTokens: totals.inputTokens,
        totalOutputTokens: totals.outputTokens,
        totalTokens: totals.inputTokens + totals.outputTokens,
        estimatedCostUsd: totals.estimatedCostUsd,
        failedRequests: totals.errorCount,
        averageRequestCostUsd: totals.requestCount > 0 ? totals.estimatedCostUsd / totals.requestCount : 0,
        topOrganisations: byOrg.map((o) => ({
          tenantId: o._id as string,
          name: orgNameMap.get(o._id as string) ?? o._id,
          requestCount: o.requestCount,
          estimatedCostUsd: o.estimatedCostUsd,
        })),
        topFeatures: byFeature.map((f) => ({ feature: f._id as string, requestCount: f.requestCount })),
        topModels: byModel.map((m) => ({ modelName: m._id as string, requestCount: m.requestCount })),
        // Additive (Sarvam, BRIEF-SARVAM Part 7): per-provider split of this month. Totals above already
        // include every provider; `combinedCostUsd` is the figure tenant spend limits apply against.
        byProvider: providerBreakdown.rows,
        combinedCostUsd: providerBreakdown.combinedCostUsd,
      };
    },
  });
}

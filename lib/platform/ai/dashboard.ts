import connectDB from "@/lib/db";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import AiUsageDaily from "@/models/platform/AiUsageDaily";
import Organization from "@/models/admin/Organization";
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

      const [thisMonthRows, lastMonthRows, todayRows, byOrg, byModel] = await Promise.all([
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
      ]);

      const orgSubdomains = byOrg.map((o) => o._id as string);
      const orgs = await Organization.find({ subdomain: { $in: orgSubdomains } }, "subdomain name").lean();
      const orgNameMap = new Map(orgs.map((o) => [o.subdomain, o.name]));

      const totals = thisMonthRows[0] ?? {
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        errorCount: 0,
      };

      return {
        totalRequestsThisMonth: totals.requestCount,
        totalRequestsToday: todayRows[0]?.requestCount ?? 0,
        totalRequestsPreviousMonth: lastMonthRows[0]?.requestCount ?? 0,
        totalInputTokens: totals.inputTokens,
        totalOutputTokens: totals.outputTokens,
        estimatedCostUsd: totals.estimatedCostUsd,
        failedRequests: totals.errorCount,
        averageRequestCostUsd: totals.requestCount > 0 ? totals.estimatedCostUsd / totals.requestCount : 0,
        topOrganisations: byOrg.map((o) => ({
          tenantId: o._id as string,
          name: orgNameMap.get(o._id as string) ?? o._id,
          requestCount: o.requestCount,
          estimatedCostUsd: o.estimatedCostUsd,
        })),
        topFeatures: byModel.map((f) => ({ feature: f._id as string, requestCount: f.requestCount })),
      };
    },
  });
}

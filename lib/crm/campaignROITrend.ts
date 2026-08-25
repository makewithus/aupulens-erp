/**
 * Day-wise Campaign ROI trend — tracks how ROI evolves over time (cumulative
 * committed budget vs. cumulative attributed revenue, by day) instead of a
 * single all-time snapshot. Same real revenue source as roiEngine.ts
 * (CrmContract.contract_value for realized contracts linked to a campaign),
 * just walked day-by-day so the CRM Reports chart can plot a real trend line.
 */
import dbConnect from "@/lib/db";
import CrmCampaign from "@/models/crm/Campaign";
import CrmContract from "@/models/crm/Contract";

const REALIZED_CONTRACT_STATUSES = ["Active", "Renewal Due", "Expiring", "Renewed"];

export interface RoiTrendPoint {
  date: string; // yyyy-MM-dd
  cumulativeBudget: number;
  cumulativeRevenue: number;
  roiPercentage: number;
}

export interface RoiTrendResult {
  points: RoiTrendPoint[];
  latestRoiPercentage: number;
}

export async function computeROITrend(tenantId: string, days = 365): Promise<RoiTrendResult> {
  await dbConnect();

  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const [campaigns, contracts] = await Promise.all([
    CrmCampaign.find({ tenantId }).select("budget start_date").lean(),
    CrmContract.find({
      tenantId,
      campaign_id: { $exists: true, $ne: null },
      status: { $in: REALIZED_CONTRACT_STATUSES },
    }).select("contract_value start_date").lean(),
  ]);

  // Sort once, then walk forward with running totals instead of re-filtering
  // the full array for every day (O(n log n + days) instead of O(days * n)).
  const budgetEvents = campaigns
    .filter((c: any) => c.start_date)
    .map((c: any) => ({ date: new Date(c.start_date).getTime(), amount: c.budget || 0 }))
    .sort((a, b) => a.date - b.date);
  const revenueEvents = contracts
    .filter((c: any) => c.start_date)
    .map((c: any) => ({ date: new Date(c.start_date).getTime(), amount: c.contract_value || 0 }))
    .sort((a, b) => a.date - b.date);

  const points: RoiTrendPoint[] = [];
  let cumulativeBudget = 0;
  let cumulativeRevenue = 0;
  let budgetIdx = 0;
  let revenueIdx = 0;

  for (let i = 0; i < days; i++) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    const dayEndMs = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999).getTime();

    while (budgetIdx < budgetEvents.length && budgetEvents[budgetIdx].date <= dayEndMs) {
      cumulativeBudget += budgetEvents[budgetIdx].amount;
      budgetIdx++;
    }
    while (revenueIdx < revenueEvents.length && revenueEvents[revenueIdx].date <= dayEndMs) {
      cumulativeRevenue += revenueEvents[revenueIdx].amount;
      revenueIdx++;
    }

    const roiPercentage = cumulativeBudget > 0 ? ((cumulativeRevenue - cumulativeBudget) / cumulativeBudget) * 100 : 0;
    points.push({
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
      cumulativeBudget,
      cumulativeRevenue,
      roiPercentage,
    });
  }

  return { points, latestRoiPercentage: points[points.length - 1]?.roiPercentage || 0 };
}

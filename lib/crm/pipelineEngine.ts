/**
 * Real aggregation for the CRM Reports "Sales Pipeline" / "Revenue Trend"
 * charts, which previously rendered seeded-random synthetic data (see
 * docs/_context/MEMORY.md). Pure Mongoose aggregation over CrmOpportunity —
 * no AI, no external data.
 */
import CrmOpportunity from "@/models/crm/Opportunity";

const CLOSED_WON = "Closed Won";
const CLOSED_LOST = "Closed Lost";

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short" }) + " '" + String(d.getFullYear()).slice(2);
}

function monthWindow(months: number): Date[] {
  const since = new Date();
  since.setDate(1);
  since.setHours(0, 0, 0, 0);
  since.setMonth(since.getMonth() - (months - 1));
  const out: Date[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i++) {
    out.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

export interface MonthlyPipelinePoint {
  monthKey: string;
  label: string;
  totalValue: number;
  weightedValue: number;
  byStage: Record<string, number>;
}

export interface PipelineTrendResult {
  months: MonthlyPipelinePoint[];
  stages: string[];
  openStageTotals: Record<string, number>;
  openPipelineValue: number;
}

export async function computePipelineTrend(tenantId: string, months = 12): Promise<PipelineTrendResult> {
  const windowMonths = monthWindow(months);
  const since = windowMonths[0];

  const buckets = new Map<string, MonthlyPipelinePoint>();
  for (const d of windowMonths) buckets.set(monthKey(d), { monthKey: monthKey(d), label: monthLabel(d), totalValue: 0, weightedValue: 0, byStage: {} });

  const created = await CrmOpportunity.find({ tenantId, createdAt: { $gte: since } })
    .select("stage amount probability createdAt")
    .lean();

  const stageSet = new Set<string>();
  for (const o of created as any[]) {
    const key = monthKey(new Date(o.createdAt));
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const amount = o.amount || 0;
    bucket.totalValue += amount;
    bucket.weightedValue += amount * ((o.probability || 0) / 100);
    bucket.byStage[o.stage] = (bucket.byStage[o.stage] || 0) + amount;
    stageSet.add(o.stage);
  }

  const openOpps = await CrmOpportunity.find({ tenantId, stage: { $nin: [CLOSED_WON, CLOSED_LOST] } })
    .select("stage amount")
    .lean();

  const openStageTotals: Record<string, number> = {};
  let openPipelineValue = 0;
  for (const o of openOpps as any[]) {
    const amount = o.amount || 0;
    openStageTotals[o.stage] = (openStageTotals[o.stage] || 0) + amount;
    openPipelineValue += amount;
    stageSet.add(o.stage);
  }

  return {
    months: Array.from(buckets.values()),
    stages: Array.from(stageSet),
    openStageTotals,
    openPipelineValue,
  };
}

export interface RevenueTrendPoint {
  monthKey: string;
  label: string;
  monthValue: number;
  cumulativeValue: number;
}

export interface RevenueTrendResult {
  points: RevenueTrendPoint[];
  totalRevenue: number;
}

export async function computeRevenueTrend(tenantId: string, months = 12): Promise<RevenueTrendResult> {
  const windowMonths = monthWindow(months);
  const since = windowMonths[0];

  const won = await CrmOpportunity.find({ tenantId, stage: CLOSED_WON, stage_entered_at: { $gte: since } })
    .select("amount stage_entered_at")
    .lean();

  const monthTotals = new Map<string, number>();
  for (const d of windowMonths) monthTotals.set(monthKey(d), 0);
  for (const o of won as any[]) {
    const key = monthKey(new Date(o.stage_entered_at));
    if (monthTotals.has(key)) monthTotals.set(key, (monthTotals.get(key) || 0) + (o.amount || 0));
  }

  let cumulative = 0;
  const points: RevenueTrendPoint[] = windowMonths.map((d) => {
    const key = monthKey(d);
    const monthValue = monthTotals.get(key) || 0;
    cumulative += monthValue;
    return { monthKey: key, label: monthLabel(d), monthValue, cumulativeValue: cumulative };
  });

  return { points, totalRevenue: cumulative };
}

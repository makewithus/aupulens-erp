/**
 * Expansion Forecast Engine
 *
 * Calculates:
 *   - Forecasted renewal revenue (monthly / quarterly / yearly)
 *   - Forecasted expansion revenue from expansion opportunities
 *   - Renewal pipeline value
 *   - Expansion pipeline value
 *   - Churn risk-adjusted forecast
 *
 * Uses contract end_dates and opportunity expected_close_dates.
 */

import dbConnect from "@/lib/db";
import CrmContract from "@/models/crm/Contract";
import CrmOpportunity from "@/models/crm/Opportunity";
import { scanTenantChurnRisk } from "@/lib/crm/churnRisk";

const EXPANSION_TYPES = ["Upsell", "Cross-Sell", "Service Upgrade", "Tier Upgrade"];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthlyBucket {
  year: number;
  month: number; // 0–11
  monthLabel: string;
  renewalRevenue: number;
  expansionRevenue: number;
  totalRevenue: number;
}

export interface ForecastResult {
  monthly: MonthlyBucket[];
  quarterly: { quarter: string; renewalRevenue: number; expansionRevenue: number; totalRevenue: number }[];
  yearly: { year: number; renewalRevenue: number; expansionRevenue: number; totalRevenue: number }[];
  summary: {
    totalRenewalPipeline: number;
    totalExpansionPipeline: number;
    totalForecastedRevenue: number;
    avgMonthlyRevenue: number;
    renewalSuccessRate: number;
    atRiskRenewalValue: number;
  };
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Main Forecast ────────────────────────────────────────────────────────────

export async function computeExpansionForecast(
  tenantId: string,
  horizonMonths = 12
): Promise<ForecastResult> {
  await dbConnect();

  const now = new Date();
  const horizonEnd = new Date(now);
  horizonEnd.setMonth(horizonEnd.getMonth() + horizonMonths);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  // Churn risk is computed live off Activity/Case/Contract signals (the same
  // engine that powers the "accounts at risk" widget) rather than read off
  // Contract.churn_risk, which nothing in the app ever writes and which
  // silently stays at its "Low" schema default forever.
  const [renewableContracts, expansionOpps, renewedCount, expiredCount, churnSummary] =
    await Promise.all([
      CrmContract.find({
        tenantId,
        status: { $in: ["Active", "Renewal Due", "Expiring"] },
        end_date: { $gte: now, $lte: horizonEnd },
      })
        .select("contract_value end_date account_id renewal_status auto_renew")
        .lean(),
      CrmOpportunity.find({
        tenantId,
        tags: { $in: EXPANSION_TYPES },
        stage: { $nin: ["Closed Won", "Closed Lost"] },
        expected_close_date: { $gte: now, $lte: horizonEnd },
      })
        .select("amount probability expected_close_date")
        .lean(),
      CrmContract.countDocuments({ tenantId, renewal_status: "Renewed" }),
      CrmContract.countDocuments({
        tenantId,
        renewal_status: { $in: ["Lost"] },
        status: "Expired",
      }),
      scanTenantChurnRisk(tenantId),
    ]);

  // ── Build month buckets ────────────────────────────────────────────────────
  const buckets: Map<string, MonthlyBucket> = new Map();

  for (let i = 0; i < horizonMonths; i++) {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() + i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets.set(key, {
      year: d.getFullYear(),
      month: d.getMonth(),
      monthLabel: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
      renewalRevenue: 0,
      expansionRevenue: 0,
      totalRevenue: 0,
    });
  }

  // ── Distribute renewal revenue by end_date ────────────────────────────────
  let totalRenewalPipeline = 0;
  let atRiskRenewalValue = 0;

  for (const c of renewableContracts) {
    const d = new Date((c as any).end_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = buckets.get(key);
    const value = (c as any).contract_value || 0;

    // Churn-risk adjustment factor — looked up from the live scan, keyed by account.
    const churnRisk = churnSummary.byAccount[String((c as any).account_id)]?.level || "Low";
    const adjustFactor =
      churnRisk === "Critical"
        ? 0.3
        : churnRisk === "High"
        ? 0.6
        : churnRisk === "Medium"
        ? 0.8
        : 1.0;

    const adjustedValue = value * adjustFactor;
    totalRenewalPipeline += adjustedValue;

    if (churnRisk === "High" || churnRisk === "Critical") {
      atRiskRenewalValue += value;
    }

    if (bucket) {
      bucket.renewalRevenue += adjustedValue;
      bucket.totalRevenue += adjustedValue;
    }
  }

  // ── Distribute expansion revenue by expected_close_date ───────────────────
  let totalExpansionPipeline = 0;

  for (const opp of expansionOpps) {
    const d = new Date((opp as any).expected_close_date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = buckets.get(key);
    const probability = (opp as any).probability || 30;
    const weighted = ((opp as any).amount || 0) * (probability / 100);
    totalExpansionPipeline += weighted;

    if (bucket) {
      bucket.expansionRevenue += weighted;
      bucket.totalRevenue += weighted;
    }
  }

  const monthly = Array.from(buckets.values());

  // ── Quarterly rollup ──────────────────────────────────────────────────────
  const quarterMap: Map<string, { quarter: string; renewalRevenue: number; expansionRevenue: number; totalRevenue: number }> =
    new Map();

  for (const b of monthly) {
    const q = Math.floor(b.month / 3) + 1;
    const key = `Q${q} ${b.year}`;
    const existing = quarterMap.get(key) || {
      quarter: key,
      renewalRevenue: 0,
      expansionRevenue: 0,
      totalRevenue: 0,
    };
    existing.renewalRevenue += b.renewalRevenue;
    existing.expansionRevenue += b.expansionRevenue;
    existing.totalRevenue += b.totalRevenue;
    quarterMap.set(key, existing);
  }

  // ── Yearly rollup ─────────────────────────────────────────────────────────
  const yearMap: Map<number, { year: number; renewalRevenue: number; expansionRevenue: number; totalRevenue: number }> =
    new Map();

  for (const b of monthly) {
    const existing = yearMap.get(b.year) || {
      year: b.year,
      renewalRevenue: 0,
      expansionRevenue: 0,
      totalRevenue: 0,
    };
    existing.renewalRevenue += b.renewalRevenue;
    existing.expansionRevenue += b.expansionRevenue;
    existing.totalRevenue += b.totalRevenue;
    yearMap.set(b.year, existing);
  }

  const totalForecastedRevenue = totalRenewalPipeline + totalExpansionPipeline;
  const renewalSuccessRate =
    renewedCount + expiredCount > 0
      ? Math.round((renewedCount / (renewedCount + expiredCount)) * 100)
      : 0;

  return {
    monthly,
    quarterly: Array.from(quarterMap.values()),
    yearly: Array.from(yearMap.values()),
    summary: {
      totalRenewalPipeline,
      totalExpansionPipeline,
      totalForecastedRevenue,
      avgMonthlyRevenue: monthly.length > 0 ? totalForecastedRevenue / monthly.length : 0,
      renewalSuccessRate,
      atRiskRenewalValue,
    },
  };
}

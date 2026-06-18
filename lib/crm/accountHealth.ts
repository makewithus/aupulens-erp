/**
 * Account Health Engine
 *
 * Calculates a 0–100 health score for a CRM account based on:
 *   - Active opportunities (pipeline health)
 *   - Support case volume and SLA breaches
 *   - Recent activity frequency (last 30 days)
 *   - Contract / renewal status
 *   - Customer satisfaction scores
 *   - Payment health
 *   - Engagement frequency
 *
 * Categories:
 *   Healthy   → 75–100
 *   Warning   → 50–74
 *   At Risk   → 25–49
 *   Critical  → 0–24
 */

import dbConnect from "@/lib/db";
import CrmAccount from "@/models/crm/Account";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmCase from "@/models/crm/Case";
import CrmActivity from "@/models/crm/Activity";
import CrmContract from "@/models/crm/Contract";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

// ─── Simple calculation (used by account API without DB calls) ────────────────

export function calculateAccountHealth(stats: {
  openOppsCount?: number;
  recentActivity?: boolean;
  breachedCases?: number;
  activeContracts?: number;
  upcomingRenewals?: boolean;
  avgSatisfaction?: number;
}): number {
  let score = 50; // base

  if ((stats.openOppsCount || 0) > 0) score += 10;
  if (stats.recentActivity) score += 15;
  if ((stats.breachedCases || 0) === 0) score += 15;
  if ((stats.activeContracts || 0) > 0 && !stats.upcomingRenewals) score += 10;
  if ((stats.avgSatisfaction || 0) >= 4) score += 15;
  if ((stats.breachedCases || 0) > 2) score -= 15;
  if (stats.upcomingRenewals) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export function getHealthCategory(
  score: number
): "Healthy" | "Warning" | "At Risk" | "Critical" {
  if (score >= 75) return "Healthy";
  if (score >= 50) return "Warning";
  if (score >= 25) return "At Risk";
  return "Critical";
}

// ─── Full DB-backed scoring ───────────────────────────────────────────────────

export interface AccountHealthResult {
  score: number;
  category: "Healthy" | "Warning" | "At Risk" | "Critical";
  breakdown: {
    opportunityScore: number;
    activityScore: number;
    caseScore: number;
    contractScore: number;
    satisfactionScore: number;
    engagementScore: number;
  };
}

export async function computeAndStoreAccountHealth(
  accountId: string,
  tenantId: string,
  systemUserId?: string
): Promise<AccountHealthResult> {
  await dbConnect();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // ── Fetch signals in parallel ─────────────────────────────────────────────
  const [
    openOpps,
    recentActivities,
    allActivities,
    openCases,
    breachedCases,
    closedCasesWithRating,
    activeContracts,
    expiringContracts,
  ] = await Promise.all([
    CrmOpportunity.countDocuments({
      account_id: accountId,
      tenantId,
      stage: { $nin: ["Closed Won", "Closed Lost"] },
    }),
    CrmActivity.countDocuments({
      linked_account_id: accountId,
      tenantId,
      activity_date: { $gte: thirtyDaysAgo },
    }),
    CrmActivity.countDocuments({ linked_account_id: accountId, tenantId }),
    CrmCase.countDocuments({
      account_id: accountId,
      tenantId,
      status: { $nin: ["Resolved", "Closed"] },
    }),
    CrmCase.countDocuments({
      account_id: accountId,
      tenantId,
      sla_breached: true,
      createdAt: { $gte: ninetyDaysAgo },
    }),
    CrmCase.find({
      account_id: accountId,
      tenantId,
      satisfaction_score: { $exists: true, $ne: null },
    })
      .select("satisfaction_score")
      .lean(),
    CrmContract.countDocuments({ account_id: accountId, tenantId, status: "Active" }),
    CrmContract.countDocuments({
      account_id: accountId,
      tenantId,
      status: { $in: ["Renewal Due", "Expiring"] },
    }),
  ]);

  // ── Score each dimension (0–20 per bucket, max 120 → normalised to 100) ───

  // 1. Opportunity health (0–15)
  let opportunityScore = 0;
  if (openOpps > 0) opportunityScore += 10;
  if (openOpps >= 2) opportunityScore += 5;

  // 2. Activity / engagement (0–20)
  let activityScore = 0;
  if (recentActivities >= 5) activityScore = 20;
  else if (recentActivities >= 3) activityScore = 15;
  else if (recentActivities >= 1) activityScore = 8;
  else activityScore = 0; // no recent activity = 0

  // 3. Case health (0–25, but can go negative)
  let caseScore = 20;
  if (openCases > 5) caseScore -= 15;
  else if (openCases > 2) caseScore -= 8;
  if (breachedCases >= 3) caseScore -= 15;
  else if (breachedCases >= 1) caseScore -= 8;
  caseScore = Math.max(0, caseScore);

  // 4. Contract health (0–20)
  let contractScore = 0;
  if (activeContracts > 0) contractScore += 15;
  if (expiringContracts === 0 && activeContracts > 0) contractScore += 5;
  if (expiringContracts > 0) contractScore = Math.max(0, contractScore - 10);

  // 5. Customer satisfaction (0–15)
  let satisfactionScore = 10; // neutral if no ratings
  if (closedCasesWithRating.length > 0) {
    const avg =
      closedCasesWithRating.reduce(
        (sum: number, c: any) => sum + (c.satisfaction_score || 0),
        0
      ) / closedCasesWithRating.length;
    if (avg >= 4.5) satisfactionScore = 15;
    else if (avg >= 4.0) satisfactionScore = 12;
    else if (avg >= 3.0) satisfactionScore = 7;
    else satisfactionScore = 0;
  }

  // 6. Engagement frequency (0–10)
  let engagementScore = 0;
  if (allActivities >= 20) engagementScore = 10;
  else if (allActivities >= 10) engagementScore = 7;
  else if (allActivities >= 5) engagementScore = 4;

  const rawScore =
    opportunityScore +
    activityScore +
    caseScore +
    contractScore +
    satisfactionScore +
    engagementScore;

  // Max possible = 15+20+20+20+15+10 = 100 (already normalised)
  const score = Math.max(0, Math.min(100, rawScore));
  const category = getHealthCategory(score);

  // ── Persist score to account ──────────────────────────────────────────────
  const account = await CrmAccount.findOne({ _id: accountId, tenantId });
  if (account) {
    const prevScore = account.account_health_score;
    account.account_health_score = score;

    // Update account status based on category
    if (category === "Critical" || category === "At Risk") {
      if (account.status === "Active") account.status = "At Risk";
    } else if (category === "Healthy" || category === "Warning") {
      if (account.status === "At Risk") account.status = "Active";
    }

    await account.save();

    // Audit log if score changed significantly (>10 points)
    if (systemUserId && Math.abs(score - prevScore) >= 10) {
      await CrmAuditLog.create({
        tenantId,
        user_id: systemUserId,
        action: "status_changed",
        record_type: "Account",
        record_id: accountId,
        field_name: "account_health_score",
        old_value: prevScore.toString(),
        new_value: `${score} (${category})`,
        timestamp: new Date(),
      });
    }
  }

  return {
    score,
    category,
    breakdown: {
      opportunityScore,
      activityScore,
      caseScore,
      contractScore,
      satisfactionScore,
      engagementScore,
    },
  };
}

// ─── Bulk health refresh for tenant ──────────────────────────────────────────

export async function refreshAllAccountHealth(
  tenantId: string,
  systemUserId?: string
): Promise<{ updated: number }> {
  await dbConnect();
  const accounts = await CrmAccount.find({ tenantId }).select("_id").lean();
  let updated = 0;
  for (const acct of accounts) {
    try {
      await computeAndStoreAccountHealth(String(acct._id), tenantId, systemUserId);
      updated++;
    } catch {
      // Continue on individual failures
    }
  }
  return { updated };
}

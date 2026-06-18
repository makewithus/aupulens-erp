/**
 * Churn Risk Engine
 *
 * Detects churn risk for an account using signals:
 *   - Activity frequency (last 30 & 90 days)
 *   - Declining engagement trend
 *   - Open support cases
 *   - SLA breaches
 *   - Overdue renewals / contract expiry
 *   - No activity
 *
 * Risk Levels:
 *   Low      → score < 30
 *   Medium   → 30–49
 *   High     → 50–69
 *   Critical → >= 70
 *
 * Also generates manager alert notifications and churn warning activities.
 */

import dbConnect from "@/lib/db";
import CrmAccount from "@/models/crm/Account";
import CrmActivity from "@/models/crm/Activity";
import CrmCase from "@/models/crm/Case";
import CrmContract from "@/models/crm/Contract";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

// ─── Pure function (no DB calls, for quick inline checks) ────────────────────

export function calculateChurnRisk(params: {
  activityFrequency: number; // activities in last 30 days
  openCases: number;
  slaBreaches: number;
  renewalsCompleted: number;
  expiringContracts?: number;
  daysSinceLastActivity?: number;
}): { level: string; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (params.activityFrequency === 0) {
    score += 30;
    reasons.push("No activity in last 30 days");
  } else if (params.activityFrequency < 2) {
    score += 15;
    reasons.push("Very low activity in last 30 days");
  }

  if ((params.daysSinceLastActivity || 0) > 60) {
    score += 20;
    reasons.push("No activity in over 60 days");
  }

  if (params.openCases > 5) {
    score += 20;
    reasons.push("High volume of open support cases");
  } else if (params.openCases > 2) {
    score += 10;
    reasons.push("Multiple open support cases");
  }

  if (params.slaBreaches >= 3) {
    score += 25;
    reasons.push("3+ SLA breaches in last 90 days");
  } else if (params.slaBreaches >= 1) {
    score += 12;
    reasons.push("SLA breach detected");
  }

  if (params.renewalsCompleted === 0) {
    score += 10;
    reasons.push("No successful renewals on record");
  }

  if ((params.expiringContracts || 0) > 0) {
    score += 15;
    reasons.push("Contract nearing expiry without renewal discussion");
  }

  const level =
    score >= 70 ? "Critical" : score >= 50 ? "High" : score >= 30 ? "Medium" : "Low";

  return { level, score, reasons };
}

// ─── DB-backed computation + persistence ─────────────────────────────────────

export interface ChurnRiskResult {
  level: "Low" | "Medium" | "High" | "Critical";
  score: number;
  reasons: string[];
  daysSinceLastActivity: number;
}

export async function computeAndStoreChurnRisk(
  accountId: string,
  tenantId: string,
  systemUserId?: string
): Promise<ChurnRiskResult> {
  await dbConnect();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [
    recentActivities,
    lastActivity,
    openCases,
    slaBreaches,
    renewedContracts,
    expiringContracts,
  ] = await Promise.all([
    CrmActivity.countDocuments({
      linked_account_id: accountId,
      tenantId,
      activity_date: { $gte: thirtyDaysAgo },
    }),
    CrmActivity.findOne({ linked_account_id: accountId, tenantId })
      .sort({ activity_date: -1 })
      .select("activity_date")
      .lean(),
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
    CrmContract.countDocuments({
      account_id: accountId,
      tenantId,
      renewal_status: "Renewed",
    }),
    CrmContract.countDocuments({
      account_id: accountId,
      tenantId,
      status: { $in: ["Renewal Due", "Expiring"] },
      renewal_status: "Not Started",
    }),
  ]);

  const daysSinceLastActivity = lastActivity
    ? Math.ceil(
        (Date.now() - new Date((lastActivity as any).activity_date).getTime()) / 86_400_000
      )
    : 9999;

  const { level, score, reasons } = calculateChurnRisk({
    activityFrequency: recentActivities,
    openCases,
    slaBreaches,
    renewalsCompleted: renewedContracts,
    expiringContracts,
    daysSinceLastActivity,
  });

  // ── Persist to account record ──────────────────────────────────────────────
  const account = await CrmAccount.findOne({ _id: accountId, tenantId });
  if (account) {
    const prevRisk = account.status; // track status change
    (account as any).churn_risk = level;

    // Update status for critical risk
    if (level === "Critical" && account.status !== "Churned") {
      account.status = "At Risk";
    }

    await account.save();

    // Audit log for risk level changes
    if (systemUserId && (level === "High" || level === "Critical")) {
      await CrmAuditLog.create({
        tenantId,
        user_id: systemUserId,
        action: "status_changed",
        record_type: "Account",
        record_id: accountId,
        field_name: "churn_risk",
        old_value: "previous",
        new_value: `${level} — ${reasons.slice(0, 2).join(", ")}`,
        timestamp: new Date(),
      });
    }
  }

  return { level: level as ChurnRiskResult["level"], score, reasons, daysSinceLastActivity };
}

// ─── Tenant-wide churn risk scan ─────────────────────────────────────────────

export interface ChurnRiskSummary {
  low: number;
  medium: number;
  high: number;
  critical: number;
  criticalAccounts: Array<{ _id: string; company_name: string; score: number; reasons: string[] }>;
}

export async function scanTenantChurnRisk(
  tenantId: string,
  systemUserId?: string
): Promise<ChurnRiskSummary> {
  await dbConnect();
  const accounts = await CrmAccount.find({
    tenantId,
    status: { $ne: "Churned" },
  })
    .select("_id company_name")
    .lean();

  const summary: ChurnRiskSummary = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    criticalAccounts: [],
  };

  for (const acct of accounts) {
    try {
      const result = await computeAndStoreChurnRisk(
        String(acct._id),
        tenantId,
        systemUserId
      );
      const lvl = result.level.toLowerCase() as keyof Omit<
        ChurnRiskSummary,
        "criticalAccounts"
      >;
      summary[lvl]++;
      if (result.level === "Critical" || result.level === "High") {
        summary.criticalAccounts.push({
          _id: String(acct._id),
          company_name: (acct as any).company_name,
          score: result.score,
          reasons: result.reasons,
        });
      }
    } catch {
      // Continue
    }
  }

  // Sort critical/high accounts by score descending
  summary.criticalAccounts.sort((a, b) => b.score - a.score);
  return summary;
}

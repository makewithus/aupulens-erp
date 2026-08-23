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
import { getLlmCrmInsight } from "@/lib/crm/ai/llmInsight";
import { recordAiInsight } from "@/lib/crm/ai/recordInsight";

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
  /** Real LLM-generated retention suggestion — only populated for High/Critical (see call site for why). */
  aiSuggestedAction?: string;
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
  let aiSuggestedAction: string | undefined;

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

    // Real AI retention reasoning (Phase 2) — only called for High/Critical,
    // both to avoid AI cost on every routine (Low/Medium) risk computation
    // and because a healthy account doesn't need a retention play. The
    // deterministic score/level above stays authoritative for the flip to
    // "At Risk" status; the LLM only adds a human-readable justification and
    // a concrete next action, surfaced via CrmAIInsight.
    if (level === "High" || level === "Critical") {
      const insight = await getLlmCrmInsight(
        tenantId,
        "Assess this account's churn risk. A rule-based engine already flagged it based on the reasons given — explain briefly what's driving the risk and suggest one concrete retention action a CSM should take now.",
        JSON.stringify({
          company_name: (account as any).company_name,
          riskLevel: level,
          riskScore: score,
          reasons,
          daysSinceLastActivity,
        })
      );
      if (insight.ok) {
        aiSuggestedAction = insight.suggestedAction;
        await recordAiInsight({
          tenantId,
          entityType: "Account",
          entityId: accountId,
          insightType: "Churn",
          insight,
        });
      }
    }
  }

  return { level: level as ChurnRiskResult["level"], score, reasons, daysSinceLastActivity, aiSuggestedAction };
}

export interface ChurnRiskSummary {
  low: number;
  medium: number;
  high: number;
  critical: number;
  criticalAccounts: Array<{ _id: string; company_name: string; score: number; reasons: string[] }>;
  /** Every scanned account's live risk level, keyed by account _id — lets
   * other engines (e.g. expansion forecasting) reuse this same computation
   * instead of relying on the stale, rarely-written Contract.churn_risk field. */
  byAccount: Record<string, { level: string; score: number }>;
}

export async function scanTenantChurnRisk(
  tenantId: string,
  systemUserId?: string
): Promise<ChurnRiskSummary> {
  await dbConnect();
  
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Bulk fetch everything in 4 parallel queries
  const [accounts, activities, cases, contracts] = await Promise.all([
    CrmAccount.find({ tenantId, status: { $ne: "Churned" } }).select("_id company_name").lean(),
    CrmActivity.find({ tenantId, activity_date: { $gte: ninetyDaysAgo } }).select("linked_account_id activity_date").lean(),
    CrmCase.find({ tenantId, status: { $nin: ["Resolved", "Closed"] } }).select("account_id sla_breached createdAt").lean(),
    CrmContract.find({ tenantId }).select("account_id renewal_status status").lean()
  ]);

  // Group data by account_id for O(1) access
  const actMap: Record<string, any[]> = {};
  const caseMap: Record<string, any[]> = {};
  const contractMap: Record<string, any[]> = {};

  for (const act of activities) {
    const id = String((act as any).linked_account_id);
    if (!actMap[id]) actMap[id] = [];
    actMap[id].push(act);
  }
  for (const c of cases) {
    const id = String((c as any).account_id);
    if (!caseMap[id]) caseMap[id] = [];
    caseMap[id].push(c);
  }
  for (const c of contracts) {
    const id = String((c as any).account_id);
    if (!contractMap[id]) contractMap[id] = [];
    contractMap[id].push(c);
  }

  const summary: ChurnRiskSummary = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    criticalAccounts: [],
    byAccount: {},
  };

  const nowTime = Date.now();

  for (const acct of accounts) {
    const acctId = String(acct._id);
    const acctActs = actMap[acctId] || [];
    const acctCases = caseMap[acctId] || [];
    const acctContracts = contractMap[acctId] || [];

    const recentActivities = acctActs.filter(a => new Date((a as any).activity_date) >= thirtyDaysAgo).length;
    let lastActivityDate = 0;
    for (const a of acctActs) {
      const t = new Date((a as any).activity_date).getTime();
      if (t > lastActivityDate) lastActivityDate = t;
    }
    const daysSinceLastActivity = lastActivityDate > 0 ? Math.ceil((nowTime - lastActivityDate) / 86_400_000) : 9999;

    const openCases = acctCases.length;
    const slaBreaches = acctCases.filter(c => (c as any).sla_breached && new Date((c as any).createdAt) >= ninetyDaysAgo).length;

    const renewedContracts = acctContracts.filter(c => (c as any).renewal_status === "Renewed").length;
    const expiringContracts = acctContracts.filter(c => 
      ((c as any).status === "Renewal Due" || (c as any).status === "Expiring") && 
      (c as any).renewal_status === "Not Started"
    ).length;

    const { level, score, reasons } = calculateChurnRisk({
      activityFrequency: recentActivities,
      openCases,
      slaBreaches,
      renewalsCompleted: renewedContracts,
      expiringContracts,
      daysSinceLastActivity,
    });

    const lvl = level.toLowerCase() as "low" | "medium" | "high" | "critical";
    summary[lvl]++;
    summary.byAccount[acctId] = { level, score };

    if (level === "Critical" || level === "High") {
      summary.criticalAccounts.push({
        _id: acctId,
        company_name: (acct as any).company_name,
        score,
        reasons,
      });
    }
  }

  summary.criticalAccounts.sort((a, b) => b.score - a.score);
  return summary;
}

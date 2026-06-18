/**
 * Expansion Engine
 *
 * Automatically identifies upsell and cross-sell opportunities for an account
 * based on:
 *   - Current active contracts and their products
 *   - Open opportunity stage history
 *   - Account segment and relationship value
 *   - Health score
 *   - Activity patterns
 *
 * Generates:
 *   - CrmOpportunity records (upsell / cross-sell)
 *   - CrmTask records for the account owner
 *   - CrmActivity records for the audit trail
 *   - Expansion recommendation objects returned to the caller
 */

import dbConnect from "@/lib/db";
import CrmAccount from "@/models/crm/Account";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmContract from "@/models/crm/Contract";
import CrmActivity from "@/models/crm/Activity";
import CrmTask from "@/models/crm/Task";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExpansionRecommendation {
  type: "Upsell" | "Cross-Sell" | "Service Upgrade" | "Tier Upgrade";
  title: string;
  rationale: string;
  estimatedValue: number;
  priority: "Low" | "Medium" | "High";
  opportunityId?: string;
}

// ─── Recommendation Rule Engine ───────────────────────────────────────────────

function generateRecommendations(ctx: {
  contractCount: number;
  contractValue: number;
  healthScore: number;
  segment: string;
  openOpps: number;
  activityCount: number;
  closedWonCount: number;
}): ExpansionRecommendation[] {
  const recs: ExpansionRecommendation[] = [];

  // Rule 1: High-value customer with healthy score → Tier upgrade
  if (ctx.healthScore >= 70 && ctx.contractValue > 50000) {
    recs.push({
      type: "Tier Upgrade",
      title: "Premium Tier Upgrade",
      rationale: `Account has a health score of ${ctx.healthScore} and contract value of $${ctx.contractValue.toLocaleString()}. High potential for premium tier.`,
      estimatedValue: ctx.contractValue * 0.3,
      priority: "High",
    });
  }

  // Rule 2: Strategic/Recurring account with >1 contract → Cross-sell
  if (
    (ctx.segment === "Strategic" || ctx.segment === "Recurring") &&
    ctx.contractCount >= 1
  ) {
    recs.push({
      type: "Cross-Sell",
      title: "Additional Service Line",
      rationale: `Strategic account with ${ctx.contractCount} active contract(s). Cross-sell complementary services to increase wallet share.`,
      estimatedValue: ctx.contractValue * 0.2,
      priority: "Medium",
    });
  }

  // Rule 3: High activity, low spend → Upsell
  if (ctx.activityCount >= 10 && ctx.contractValue < 20000) {
    recs.push({
      type: "Upsell",
      title: "Volume Discount Upsell",
      rationale: `High engagement (${ctx.activityCount} activities) but low contract value. Upsell to higher volume tier with discount incentive.`,
      estimatedValue: 15000,
      priority: "High",
    });
  }

  // Rule 4: Account with closed-won history → Service upgrade
  if (ctx.closedWonCount >= 1 && ctx.healthScore >= 50) {
    recs.push({
      type: "Service Upgrade",
      title: "Professional Services Package",
      rationale: `Account has ${ctx.closedWonCount} closed-won deal(s) and a solid health score. Professional services or support upgrade is likely.`,
      estimatedValue: ctx.contractValue * 0.15,
      priority: "Medium",
    });
  }

  // Rule 5: No open opps but active contracts → Upsell gap
  if (ctx.openOpps === 0 && ctx.contractCount > 0) {
    recs.push({
      type: "Upsell",
      title: "Expansion Opportunity (No Open Pipeline)",
      rationale: `Active contracts but no open opportunities in pipeline. Risk of silent churn. Initiate expansion discussion.`,
      estimatedValue: ctx.contractValue * 0.25,
      priority: "High",
    });
  }

  return recs;
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export async function runExpansionEngine(
  accountId: string,
  tenantId: string,
  systemUserId: string
): Promise<ExpansionRecommendation[]> {
  await dbConnect();

  const [account, contracts, activities, openOpps, closedWonOpps] = await Promise.all([
    CrmAccount.findOne({ _id: accountId, tenantId }).lean(),
    CrmContract.find({ account_id: accountId, tenantId, status: "Active" }).lean(),
    CrmActivity.countDocuments({ linked_account_id: accountId, tenantId }),
    CrmOpportunity.countDocuments({
      account_id: accountId,
      tenantId,
      stage: { $nin: ["Closed Won", "Closed Lost"] },
    }),
    CrmOpportunity.countDocuments({
      account_id: accountId,
      tenantId,
      stage: "Closed Won",
    }),
  ]);

  if (!account) return [];

  const contractValue = contracts.reduce(
    (sum: number, c: any) => sum + (c.contract_value || 0),
    0
  );

  const recommendations = generateRecommendations({
    contractCount: contracts.length,
    contractValue,
    healthScore: (account as any).account_health_score || 0,
    segment: (account as any).segment || "Standard",
    openOpps,
    activityCount: activities,
    closedWonCount: closedWonOpps,
  });

  // ── Materialise top recommendations as CRM records ───────────────────────
  for (const rec of recommendations.filter((r) => r.priority === "High")) {
    // Create opportunity
    const opp = await CrmOpportunity.create({
      tenantId,
      deal_name: `${rec.type}: ${rec.title} — ${(account as any).company_name}`,
      account_id: accountId,
      amount: rec.estimatedValue,
      stage: "Discovery",
      stage_history: [{ stage: "Discovery", entered_at: new Date() }],
      probability: rec.type === "Upsell" ? 40 : 30,
      expected_close_date: (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 3);
        return d;
      })(),
      owner_id: (account as any).owner_id || systemUserId,
      createdBy: systemUserId,
      tags: [rec.type],
    });

    rec.opportunityId = String(opp._id);

    // Create task for account owner
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    await CrmTask.create({
      tenantId,
      title: `${rec.type}: ${rec.title}`,
      description: rec.rationale,
      category: "Follow Up",
      assigned_to_id: (account as any).owner_id || systemUserId,
      due_date: dueDate,
      priority: "High",
      status: "Pending",
      linked_account_id: accountId,
      linked_opportunity_id: opp._id,
      createdBy: systemUserId,
    });

    // Create activity
    await CrmActivity.create({
      tenantId,
      type: "Note",
      subject: `Expansion Alert: ${rec.type} — ${rec.title}`,
      description: `Automated expansion recommendation generated. ${rec.rationale} Estimated value: $${rec.estimatedValue.toLocaleString()}.`,
      performed_by_id: systemUserId,
      activity_date: new Date(),
      linked_account_id: accountId,
      linked_opportunity_id: opp._id,
      createdBy: systemUserId,
    });

    // Audit log
    await CrmAuditLog.create({
      tenantId,
      user_id: systemUserId,
      action: "created",
      record_type: "Opportunity",
      record_id: opp._id,
      new_value: `${rec.type}: ${rec.title}`,
      timestamp: new Date(),
    });
  }

  return recommendations;
}

// ─── Account-level expansion summary ─────────────────────────────────────────

export async function getExpansionSummary(accountId: string, tenantId: string) {
  await dbConnect();

  const expansionOpps = await CrmOpportunity.find({
    account_id: accountId,
    tenantId,
    deal_name: { $regex: /^(Upsell|Cross-Sell|Service Upgrade|Tier Upgrade):/, $options: "i" },
    stage: { $nin: ["Closed Won", "Closed Lost"] },
  })
    .select("deal_name amount stage probability")
    .lean();

  const totalEstimated = expansionOpps.reduce(
    (sum: number, o: any) => sum + (o.amount || 0),
    0
  );

  return {
    openExpansionOpps: expansionOpps.length,
    totalEstimatedExpansionValue: totalEstimated,
    opportunities: expansionOpps,
  };
}

import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Opportunity from "@/models/crm/Opportunity";
import Lead from "@/models/crm/Lead";
import Account from "@/models/crm/Account";
import Campaign from "@/models/crm/Campaign";
import Contract from "@/models/crm/Contract";
import User from "@/models/auth/User";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const isFresh = req.nextUrl.searchParams.get("fresh") === "true";
    const rangeKey = req.nextUrl.searchParams.get("range") || "30d";
    const rangeDays = rangeKey === "1y" ? 365 : rangeKey === "90d" ? 90 : 30;
    const rangeEnd = new Date();
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - rangeDays);
    const cacheKey = `crm-analytics-live:${tenantId}:${rangeKey}`;

    if (!isFresh) {
      const cached = getCachedData<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    await connectDB();

    // 1. Core Counts & Summaries
    const [
      oppCount,
      leadCount,
      leadCountRange,
      accountCount,
      campaignCount,
      oppsByStage,
      leadSourcesRaw,
      cohortLeadsRaw,
      monthlyOppsRaw,
      repsAggRaw,
      accountHealthRaw,
      closedOpportunities,
      renewalStats,
      activeContracts,
    ] = await Promise.all([
      Opportunity.countDocuments({ tenantId }),
      Lead.countDocuments({ tenantId }),
      Lead.countDocuments({ tenantId, createdAt: { $gte: rangeStart, $lte: rangeEnd } }),
      Account.countDocuments({ tenantId }),
      Campaign.countDocuments({ tenantId }),

      // Group opportunities by stage
      Opportunity.aggregate([
        { $match: { tenantId } },
        {
          $group: {
            _id: "$stage",
            count: { $sum: 1 },
            totalValue: { $sum: { $ifNull: ["$amount", 0] } },
            avgDays: {
              $avg: {
                $divide: [
                  { $subtract: [new Date(), { $ifNull: ["$stage_entered_at", "$createdAt"] }] },
                  1000 * 60 * 60 * 24,
                ],
              },
            },
          },
        },
      ]),

      // Group leads by source
      Lead.aggregate([
        { $match: { tenantId, createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
        { $group: { _id: "$source", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Keep the selected-period lead cohort intact so its current status can
      // be compared with opportunities linked to those same leads.
      Lead.find({ tenantId, createdAt: { $gte: rangeStart, $lte: rangeEnd } }).select("_id status").lean(),

      // Fetch opportunities created in range or closed won in range. New
      // pipeline is dated by creation; bookings are dated by Won stage history.
      Opportunity.find({
        tenantId,
        $or: [
          { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
          { stage: "Closed Won", stage_history: { $elemMatch: { stage: "Closed Won", entered_at: { $gte: rangeStart, $lte: rangeEnd } } } },
          { stage: "Closed Won", stage_entered_at: { $gte: rangeStart, $lte: rangeEnd } },
        ],
      }).select("createdAt amount stage stage_entered_at stage_history").lean(),

      // Group opportunities by owner to compute real sales rep attainment
      Opportunity.aggregate([
        { $match: { tenantId, owner_id: { $ne: null } } },
        {
          $group: {
            _id: "$owner_id",
            closedWonAmount: {
              $sum: { $cond: [{ $eq: ["$stage", "Closed Won"] }, { $ifNull: ["$amount", 0] }, 0] },
            },
            activeDealsCount: {
              $sum: { $cond: [{ $in: ["$stage", ["Closed Won", "Closed Lost"]] }, 0, 1] },
            },
            wonCount: { $sum: { $cond: [{ $eq: ["$stage", "Closed Won"] }, 1, 0] } },
          },
        },
        { $sort: { closedWonAmount: -1 } },
        { $limit: 5 },
      ]),

      // Group accounts by health score
      Account.aggregate([
        { $match: { tenantId } },
        {
          $bucket: {
            groupBy: "$account_health_score",
            boundaries: [0, 25, 50, 75, 101],
            default: "Unknown",
            output: {
              count: { $sum: 1 },
              totalValue: { $sum: { $ifNull: ["$relationship_value", 0] } },
            },
          },
        },
      ]),
      Opportunity.aggregate([
        { $match: { tenantId, stage: { $in: ["Closed Won", "Closed Lost"] } } },
        { $project: { createdAt: 1, stage_history: 1 } },
      ]),
      Contract.aggregate([
        { $match: { tenantId, renewal_status: { $in: ["Renewed", "Lost"] } } },
        { $group: { _id: "$renewal_status", count: { $sum: 1 } } },
      ]),
      Contract.aggregate([
        { $match: { tenantId, status: "Active" } },
        { $group: { _id: "$billing_frequency", contractValue: { $sum: "$contract_value" } } },
      ]),
    ]);

    // 2. Compute Real Dynamic Totals
    let totalPipelineValue = 0;
    let wonDeals = 0;
    let wonValue = 0;
    let lostDeals = 0;
    let activeDeals = 0;

    for (const stage of oppsByStage) {
      const s = String(stage._id || "").toLowerCase();
      if (s.includes("won") || s.includes("closed won")) {
        wonDeals += stage.count;
        wonValue += stage.totalValue;
      } else if (s.includes("lost") || s.includes("closed lost")) {
        lostDeals += stage.count;
      } else {
        activeDeals += stage.count;
        totalPipelineValue += stage.totalValue;
      }
    }

    const totalClosed = wonDeals + lostDeals;
    const winRate = totalClosed > 0 ? Math.round((wonDeals / totalClosed) * 100) : (wonDeals > 0 ? 100 : 0);

    // 3. Lead cohort funnel: every step starts from leads created in the
    // selected period. Opportunity steps count distinct linked leads, not a
    // mix of opportunity rows and lead rows.
    const cohortLeadIds = (cohortLeadsRaw as any[]).map((lead: any) => lead._id);
    const cohortLeadIdSet = new Set(cohortLeadIds.map((id: any) => String(id)));
    const cohortLeadStatuses = new Map((cohortLeadsRaw as any[]).map((lead: any) => [String(lead._id), lead.status]));
    const cohortOpportunities = cohortLeadIds.length
      ? await Opportunity.find({ tenantId, lead_id: { $in: cohortLeadIds } }).select("lead_id stage").lean()
      : [];

    const engagedStatuses = new Set(["Attempting Contact", "Connected", "Qualified", "Nurture", "Converted"]);
    const qualifiedStatuses = new Set(["Qualified", "Converted"]);
    const engagedCount = [...cohortLeadStatuses.values()].filter((status: any) => engagedStatuses.has(status)).length;
    const qualifiedCount = [...cohortLeadStatuses.values()].filter((status: any) => qualifiedStatuses.has(status)).length;
    const leadsWithOpportunities = new Set<string>();
    const activeOpportunityLeads = new Set<string>();
    const wonOpportunityLeads = new Set<string>();
    const lostOpportunityLeads = new Set<string>();
    const opportunityStagesByLead = new Map<string, Set<string>>();
    for (const opportunity of cohortOpportunities as any[]) {
      const leadId = String(opportunity.lead_id);
      if (!cohortLeadIdSet.has(leadId)) continue;
      leadsWithOpportunities.add(leadId);
      const stages = opportunityStagesByLead.get(leadId) || new Set<string>();
      stages.add(opportunity.stage);
      opportunityStagesByLead.set(leadId, stages);
    }
    for (const [leadId, stages] of opportunityStagesByLead) {
      // Assign each lead with multiple linked opportunities to one outcome so
      // the three outcome counts remain mutually exclusive and reconcile.
      if (stages.has("Closed Won")) wonOpportunityLeads.add(leadId);
      else if ([...stages].some((stage) => stage !== "Closed Lost")) activeOpportunityLeads.add(leadId);
      else lostOpportunityLeads.add(leadId);
    }

    const funnel = [
      {
        stage: "Inbound Leads",
        count: leadCountRange,
      },
      {
        stage: "Engaged Leads",
        count: engagedCount,
      },
      {
        stage: "Qualified Leads",
        count: qualifiedCount,
      },
      {
        stage: "Leads with Opportunities",
        count: leadsWithOpportunities.size,
      },
      {
        stage: "Leads with Active Opportunities",
        count: activeOpportunityLeads.size,
      },
      {
        stage: "Leads with Won Opportunities",
        count: wonOpportunityLeads.size,
      },
      {
        stage: "Leads with Lost Opportunities",
        count: lostOpportunityLeads.size,
      },
    ];

    // 4. Dynamic Monthly Velocity from Database
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const velocityByMonth = new Map<string, { newPipeline: number; closedWon: number }>();
    for (const opportunity of monthlyOppsRaw as any[]) {
      const amount = Number(opportunity.amount) || 0;
      const createdAt = opportunity.createdAt ? new Date(opportunity.createdAt) : null;
      if (createdAt && createdAt >= rangeStart && createdAt <= rangeEnd) {
        const key = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}`;
        const point = velocityByMonth.get(key) || { newPipeline: 0, closedWon: 0 };
        point.newPipeline += amount;
        velocityByMonth.set(key, point);
      }

      const history = Array.isArray(opportunity.stage_history) ? opportunity.stage_history : [];
      const wonEntry = opportunity.stage === "Closed Won"
        ? [...history].reverse().find((entry: any) => entry.stage === "Closed Won" && entry.entered_at)
        : null;
      const wonAt = wonEntry?.entered_at ? new Date(wonEntry.entered_at) :
        opportunity.stage === "Closed Won" && opportunity.stage_entered_at ? new Date(opportunity.stage_entered_at) : null;
      if (wonAt && wonAt >= rangeStart && wonAt <= rangeEnd) {
        const key = `${wonAt.getFullYear()}-${String(wonAt.getMonth() + 1).padStart(2, "0")}`;
        const point = velocityByMonth.get(key) || { newPipeline: 0, closedWon: 0 };
        point.closedWon += amount;
        velocityByMonth.set(key, point);
      }
    }
    const monthlyVelocity = [...velocityByMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
      const [year, month] = key.split("-");
      const monthName = monthNames[Number(month) - 1] || month;
      return { month: `${monthName} '${year.slice(-2)}`, ...value };
    });

    // 5. Dynamic Lead Source Attribution
    const leadSourcesTotal = leadSourcesRaw.reduce((acc: number, s: any) => acc + s.count, 0);
    const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#64748b", "#6366f1"];
    const leadSources = leadSourcesRaw.map((s: any, idx: number) => ({
      name: s._id || "Unspecified",
      count: s.count,
      value: leadSourcesTotal > 0 ? Math.round((s.count / leadSourcesTotal) * 100) : 0,
      color: colors[idx % colors.length],
    }));

    // 6. Stage Aging & Bottleneck Durations
    const stageAgingDays = oppsByStage
      .filter((s: any) => !["Closed Won", "Closed Lost"].includes(s._id))
      .map((s: any) => {
      const actualDays = Math.max(0, Math.round(s.avgDays || 0));
      return {
        stage: s._id || "Stage",
        days: actualDays,
      };
      })
      .sort((a: any, b: any) => b.days - a.days)
      .slice(0, 5);

    // 7. Dynamic Sales Rep Quota Leaderboard with Real User Records
    const repIds = repsAggRaw.map((r: any) => r._id);
    const users = await User.find({ _id: { $in: repIds } }).select("name email role").lean();
    const userMap = new Map(users.map((u: any) => [String(u._id), u.name || u.email]));

    const highestClosedBookings = Math.max(0, ...repsAggRaw.map((r: any) => Number(r.closedWonAmount) || 0));
    const repLeaderboard = repsAggRaw.map((r: any) => {
      const repName = userMap.get(String(r._id)) || `Account Executive (${String(r._id).slice(-4)})`;
      return {
        name: repName,
        role: "Commercial AE",
        closed: r.closedWonAmount,
        activeDeals: r.activeDealsCount,
        closedShare: highestClosedBookings > 0 ? Math.round((r.closedWonAmount / highestClosedBookings) * 100) : 0,
      };
    });

    const cycleDurations = closedOpportunities.flatMap((opportunity: any) => {
      const matchingStage = [...(opportunity.stage_history || [])].reverse().find((item: any) =>
        ["Closed Won", "Closed Lost"].includes(item.stage),
      );
      const closedAt = matchingStage?.entered_at;
      if (!opportunity.createdAt || !closedAt) return [];
      const days = (new Date(closedAt).getTime() - new Date(opportunity.createdAt).getTime()) / 86_400_000;
      return Number.isFinite(days) && days >= 0 ? [days] : [];
    });
    const avgSalesCycleDays = cycleDurations.length
      ? Math.round(cycleDurations.reduce((sum: number, days: number) => sum + days, 0) / cycleDurations.length)
      : null;

    const renewalCounts = Object.fromEntries(renewalStats.map((row: any) => [row._id, row.count]));
    const resolvedRenewals = (renewalCounts.Renewed || 0) + (renewalCounts.Lost || 0);
    const grossRenewalRate = resolvedRenewals > 0
      ? Math.round(((renewalCounts.Renewed || 0) / resolvedRenewals) * 100)
      : null;
    const projectedArr = activeContracts.reduce((sum: number, contract: any) => {
      const multiplier: Record<string, number> = {
        Monthly: 12,
        Quarterly: 4,
        "Semi-Annual": 2,
        Annual: 1,
      };
      return sum + (Number(contract.contractValue) || 0) * (multiplier[contract._id] || 0);
    }, 0);

    // 8. Churn & Account Resilience
    let criticalCount = 0;
    let highRiskCount = 0;
    let warningCount = 0;
    let healthyCount = 0;
    let atRiskVal = 0;

    for (const b of accountHealthRaw) {
      if (b._id === 0) {
        criticalCount += b.count;
        atRiskVal += b.totalValue;
      } else if (b._id === 25) {
        highRiskCount += b.count;
        atRiskVal += b.totalValue;
      } else if (b._id === 50) {
        warningCount += b.count;
      } else if (b._id === 75) {
        healthyCount += b.count;
      }
    }

    const responsePayload = {
      summary: {
        totalPipelineValue,
        activeDeals,
        wonDeals,
        lostDeals,
        winRate,
        avgSalesCycleDays,
        avgDealSize: Math.round(totalPipelineValue / Math.max(activeDeals, 1)),
        projectedArr: Math.round(projectedArr),
        totalAccounts: accountCount,
        totalLeads: leadCount,
        totalOpportunities: oppCount,
      },
      funnel,
      monthlyVelocity,
      leadSources,
      stageAgingDays,
      repLeaderboard,
      churnRetention: {
        netRevenueRetention: null,
        grossRenewalRate,
        atRiskRevenue: atRiskVal,
        healthyAccounts: healthyCount,
        warningAccounts: warningCount,
        highRiskAccounts: highRiskCount,
        criticalRiskAccounts: criticalCount,
      },
    };

    // Store in server cache with short 5s TTL for high freshness
    setCachedData(cacheKey, responsePayload, 5_000);

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Error in live CRM analytics API:", error);
    return NextResponse.json(
      { error: "Failed to generate dynamic CRM analytics", details: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}

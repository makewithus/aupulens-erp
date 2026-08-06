import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAccount from "@/models/crm/Account";
import CrmLead from "@/models/crm/Lead";
import CrmAIInsight from "@/models/crm/AIInsight";
import CrmActivity from "@/models/crm/Activity";
import { evaluateOpportunityHealth } from "@/lib/crm/opportunityHealth";
import { calculateForecast } from "@/lib/crm/forecast";
import { analyzeLeadCompleteness } from "@/lib/crm/dataCompletion";

/**
 * Real data backing /crm/ai/dashboard (Phase 2). Previously this page was
 * 100% hardcoded static markup with no fetch() call at all — every number
 * here is now computed from live tenant data.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const tenantId = session.user.tenantId;

  await dbConnect();

  const [openOpportunities, highChurnAccountsCount, leads, topRecommendations] = await Promise.all([
    CrmOpportunity.find({ tenantId, stage: { $nin: ["Closed Won", "Closed Lost"] } }).lean(),
    CrmAccount.countDocuments({ tenantId, churn_risk: { $in: ["High", "Critical"] } }),
    CrmLead.find({ tenantId }, "company_name budget_range email phone expected_timeline").lean(),
    CrmAIInsight.find({ tenantId, status: "Active" }).sort({ confidence: -1 }).limit(5).lean(),
  ]);

  // At-risk deals: evaluateOpportunityHealth is a pure, cheap function (no
  // DB/AI calls) — safe to run across every open opportunity for a real
  // aggregate, unlike the per-record LLM assessment (only called on the
  // single-opportunity detail route, see app/api/crm/opportunities/[id]/route.ts).
  let atRiskDealsCount = 0;
  let atRiskPipelineValue = 0;
  for (const opp of openOpportunities) {
    const health = evaluateOpportunityHealth(opp as any, null, 0, 50);
    if (health.level === "Critical" || health.level === "At Risk") {
      atRiskDealsCount++;
      atRiskPipelineValue += (opp as any).amount || 0;
    }
  }

  const forecast = calculateForecast(openOpportunities);
  const forecastConfidencePercent =
    forecast.totalPipeline > 0 ? Math.round((forecast.weightedPipeline / forecast.totalPipeline) * 100) : 0;

  const dataHealth = analyzeLeadCompleteness(leads);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const recentLeads = await CrmLead.find(
    { tenantId, createdAt: { $gte: thirtyDaysAgo } },
    "lead_score"
  ).lean();
  const avgLeadScore =
    recentLeads.length > 0
      ? Math.round(recentLeads.reduce((sum: number, l: any) => sum + (l.lead_score || 0), 0) / recentLeads.length)
      : null;

  return NextResponse.json({
    success: true,
    data: {
      atRiskDeals: { count: atRiskDealsCount, pipelineValue: atRiskPipelineValue },
      highChurnAccounts: { count: highChurnAccountsCount },
      forecast: { confidencePercent: forecastConfidencePercent, weightedPipeline: forecast.weightedPipeline, totalPipeline: forecast.totalPipeline },
      dataHealth,
      leadQuality: { avgScoreLast30Days: avgLeadScore, sampleSize: recentLeads.length },
      topRecommendations,
    },
  });
}

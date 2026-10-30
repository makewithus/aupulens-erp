import { NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmTask from "@/models/crm/Task";
import CrmCase from "@/models/crm/Case";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmContract from "@/models/crm/Contract";
import { applyDemoScope } from "@/lib/auth/scopeFilter";

export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const tenantId = session.user.tenantId;
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const base = applyDemoScope(session, { tenantId });
  const taskScope = applyDemoScope(session, { tenantId, assigned_to_id: session.user.id });
  const [tasksToday, highPriorityTasks, overdueTasks, openTasks, weeklyLeads, opportunities, openCases, highPriorityCases, satisfiedCases, slaBreaches, renewedContracts, resolvedContracts] = await Promise.all([
    CrmTask.countDocuments({ ...taskScope, due_date: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()), $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) }, status: { $nin: ["Completed", "Cancelled"] } }),
    CrmTask.countDocuments({ ...taskScope, priority: { $in: ["High", "Urgent"] }, status: { $nin: ["Completed", "Cancelled"] } }),
    CrmTask.countDocuments({ ...taskScope, due_date: { $lt: now }, status: { $nin: ["Completed", "Cancelled"] } }),
    CrmTask.countDocuments({ ...base, status: { $nin: ["Completed", "Cancelled"] } }),
    CrmLead.countDocuments({ ...applyDemoScope(session, { tenantId, owner_id: session.user.id }), createdAt: { $gte: weekStart } }),
    CrmOpportunity.find(base).select("amount probability stage expected_close_date").lean(),
    CrmCase.countDocuments({ ...base, status: { $nin: ["Resolved", "Closed"] } }),
    CrmCase.countDocuments({ ...base, severity: { $in: ["High", "Critical"] }, status: { $nin: ["Resolved", "Closed"] } }),
    CrmCase.find({ ...base, satisfaction_score: { $gte: 1, $lte: 5 } }).select("satisfaction_score").lean(),
    // Derive the live breach count from the deadline. The stored flag can go
    // stale while a case remains open, so it must not drive dashboard KPIs.
    CrmCase.countDocuments({ ...base, sla_target_at: { $lt: now }, status: { $nin: ["Resolved", "Closed"] } }),
    CrmContract.countDocuments({ ...base, renewal_status: "Renewed" }),
    CrmContract.countDocuments({ ...base, renewal_status: { $in: ["Renewed", "Lost"] } }),
  ]);

  const openOpportunities = opportunities.filter((opportunity: any) => opportunity.stage !== "Closed Won" && opportunity.stage !== "Closed Lost");
  const wonOpportunities = opportunities.filter((opportunity: any) => opportunity.stage === "Closed Won").length;
  const lostOpportunities = opportunities.filter((opportunity: any) => opportunity.stage === "Closed Lost").length;
  const pipelineValue = openOpportunities.reduce((sum, opportunity: any) => sum + (Number(opportunity.amount) || 0), 0);
  const weightedValue = openOpportunities.reduce((sum, opportunity: any) => sum + (Number(opportunity.amount) || 0) * (Number(opportunity.probability) || 0) / 100, 0);
  const closedOpportunities = wonOpportunities + lostOpportunities;
  const forecast = openOpportunities.reduce((result: any, opportunity: any) => {
    const amount = Number(opportunity.amount) || 0;
    const weighted = amount * (Number(opportunity.probability) || 0) / 100;
    if (opportunity.expected_close_date) {
      const date = new Date(opportunity.expected_close_date);
      if (date.getFullYear() === now.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(now.getMonth() / 3)) result.currentQuarter += weighted;
      result.year += weighted;
    }
    return result;
  }, { currentQuarter: 0, year: 0 });
  const satisfactionTotal = satisfiedCases.reduce((sum, item: any) => sum + Number(item.satisfaction_score || 0), 0);

  return NextResponse.json({
    success: true,
    data: {
      sales: { tasksToday, highPriorityTasks, overdueTasks, pipelineValue, openOpportunities: openOpportunities.length, weeklyLeads },
      manager: { pipelineValue, weightedPipeline: weightedValue, openOpportunities: openOpportunities.length, winRate: closedOpportunities ? Math.round(wonOpportunities / closedOpportunities * 100) : null, openTasks },
      support: { openCases, highPriorityCases, slaBreaches, averageSatisfaction: satisfiedCases.length ? Number((satisfactionTotal / satisfiedCases.length).toFixed(1)) : null, satisfactionResponses: satisfiedCases.length },
      executive: { weightedForecast: forecast.currentQuarter, annualWeightedForecast: forecast.year, pipelineValue, winRate: closedOpportunities ? Math.round(wonOpportunities / closedOpportunities * 100) : null, retentionRate: resolvedContracts ? Math.round(renewedContracts / resolvedContracts * 100) : null },
    },
  });
}

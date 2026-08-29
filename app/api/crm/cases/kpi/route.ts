import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const tenantId = session.user.tenantId;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    openCases,
    overdueCases,
    slaBreaches,
    breachedOpenCases,
    resolvedToday,
    escalations,
    reopenedCases,
    avgSatData,
    avgResTimeData,
    escalationsTodayData,
  ] = await Promise.all([
    CrmCase.countDocuments({ tenantId, status: { $nin: ['Resolved', 'Closed'] } }),
    CrmCase.countDocuments({ tenantId, status: { $nin: ['Resolved', 'Closed'] }, sla_target_at: { $lt: now } }),
    CrmCase.countDocuments({ tenantId, sla_breached: true }),
    CrmCase.countDocuments({ tenantId, sla_breached: true, status: { $nin: ['Resolved', 'Closed'] } }),
    CrmCase.countDocuments({ tenantId, status: 'Resolved', updatedAt: { $gte: startOfDay } }),
    CrmCase.countDocuments({ tenantId, escalation_level: { $gt: 0 } }),
    CrmCase.countDocuments({ tenantId, status: 'Reopened' }),
    CrmCase.aggregate([
      { $match: { tenantId, satisfaction_score: { $exists: true, $ne: null } } },
      { $group: { _id: null, avgScore: { $avg: "$satisfaction_score" } } }
    ]),
    CrmCase.aggregate([
      { $match: { tenantId, status: { $in: ['Resolved', 'Closed'] } } },
      { $group: { _id: null, avgMs: { $avg: { $subtract: ["$updatedAt", "$createdAt"] } } } }
    ]),
    CrmCase.aggregate([
      { $match: { tenantId, escalation_history: { $exists: true, $ne: [] } } },
      { $unwind: "$escalation_history" },
      { $match: { "escalation_history.timestamp": { $gte: startOfDay } } },
      { $count: "count" },
    ]),
  ]);

  const avgSatScore = avgSatData.length > 0 ? avgSatData[0].avgScore.toFixed(1) : 0;
  const avgResTimeMs = avgResTimeData[0]?.avgMs || 0;
  const avgResTime = avgResTimeMs > 0
    ? `${Math.floor(avgResTimeMs / 3600000)}h ${Math.round((avgResTimeMs % 3600000) / 60000)}m`
    : "N/A";
  const escalationsToday = escalationsTodayData[0]?.count || 0;

  return NextResponse.json({
    success: true,
    data: {
      openCases,
      overdueCases,
      slaBreaches,
      breachedOpenCases,
      resolvedToday,
      avgResTime,
      reopenedCases,
      avgSatScore,
      escalations,
      escalationsToday,
    }
  });
}

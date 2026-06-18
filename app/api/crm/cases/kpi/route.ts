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
    resolvedToday,
    escalations,
    avgSatData
  ] = await Promise.all([
    CrmCase.countDocuments({ tenantId, status: { $nin: ['Resolved', 'Closed'] } }),
    CrmCase.countDocuments({ tenantId, status: { $nin: ['Resolved', 'Closed'] }, sla_target_at: { $lt: now } }),
    CrmCase.countDocuments({ tenantId, sla_breached: true }),
    CrmCase.countDocuments({ tenantId, status: 'Resolved', updatedAt: { $gte: startOfDay } }),
    CrmCase.countDocuments({ tenantId, escalation_level: { $gt: 0 } }),
    CrmCase.aggregate([
      { $match: { tenantId, satisfaction_score: { $exists: true, $ne: null } } },
      { $group: { _id: null, avgScore: { $avg: "$satisfaction_score" } } }
    ])
  ]);

  const avgSatScore = avgSatData.length > 0 ? avgSatData[0].avgScore.toFixed(1) : 0;
  const avgResTime = "4h 20m"; // Mocked complex calculation for now unless there's a resolved_at field
  const reopenedCases = await CrmCase.countDocuments({ tenantId, status: 'Reopened' });

  return NextResponse.json({
    success: true,
    data: {
      openCases,
      overdueCases,
      slaBreaches,
      resolvedToday,
      avgResTime,
      reopenedCases,
      avgSatScore,
      escalations
    }
  });
}

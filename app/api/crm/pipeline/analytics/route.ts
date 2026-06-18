import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  
  const pipeline = await CrmOpportunity.aggregate([
    { $match: { tenantId: session.user.tenantId } },
    { $group: {
        _id: null,
        total_opportunities: { $sum: 1 },
        total_pipeline_value: { $sum: { $cond: [{ $in: ['$stage', ['Closed Won', 'Closed Lost']] }, 0, '$amount'] } },
        weighted_pipeline: { $sum: { $cond: [{ $in: ['$stage', ['Closed Won', 'Closed Lost']] }, 0, { $multiply: ['$amount', { $divide: ['$probability', 100] }] }] } },
        closed_won_count: { $sum: { $cond: [{ $eq: ['$stage', 'Closed Won'] }, 1, 0] } },
        closed_lost_count: { $sum: { $cond: [{ $eq: ['$stage', 'Closed Lost'] }, 1, 0] } },
        total_closed: { $sum: { $cond: [{ $in: ['$stage', ['Closed Won', 'Closed Lost']] }, 1, 0] } }
    }}
  ]);

  const stats = pipeline[0] || {
    total_opportunities: 0, total_pipeline_value: 0, weighted_pipeline: 0, closed_won_count: 0, closed_lost_count: 0, total_closed: 0
  };

  return NextResponse.json({
    success: true,
    data: {
      totalOpportunities: stats.total_opportunities,
      totalPipelineValue: stats.total_pipeline_value,
      weightedPipeline: stats.weighted_pipeline,
      averageDealSize: stats.total_opportunities > 0 ? stats.total_pipeline_value / stats.total_opportunities : 0,
      winRate: stats.total_closed > 0 ? (stats.closed_won_count / stats.total_closed) * 100 : 0,
      lossRate: stats.total_closed > 0 ? (stats.closed_lost_count / stats.total_closed) * 100 : 0
    }
  });
}

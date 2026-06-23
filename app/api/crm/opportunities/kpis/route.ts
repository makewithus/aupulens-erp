import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import { requireRole } from "@/lib/crm/rbac";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId)
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    requireRole(session, ['opportunity.view', 'opportunity.read']);

    await dbConnect();
    const tenantId = session.user.tenantId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [summary] = await CrmOpportunity.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: null,
          totalPipelineValue: {
            $sum: {
              $cond: [
                { $not: [{ $in: ["$stage", ["Closed Won", "Closed Lost"]] }] },
                { $ifNull: ["$amount", 0] },
                0,
              ],
            },
          },
          weightedPipelineValue: {
            $sum: {
              $cond: [
                { $not: [{ $in: ["$stage", ["Closed Won", "Closed Lost"]] }] },
                {
                  $multiply: [
                    { $ifNull: ["$amount", 0] },
                    { $divide: [{ $ifNull: ["$probability", 0] }, 100] },
                  ],
                },
                0,
              ],
            },
          },
          openOpportunities: {
            $sum: {
              $cond: [{ $not: [{ $in: ["$stage", ["Closed Won", "Closed Lost"]] }] }, 1, 0],
            },
          },
          dealsAtRisk: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $not: [{ $in: ["$stage", ["Closed Won", "Closed Lost"]] }] },
                    {
                      $or: [
                        { $in: ["$risk_level", ["High", "Critical"]] },
                        { $eq: ["$is_at_risk", true] },
                      ],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          closingThisMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $not: [{ $in: ["$stage", ["Closed Won", "Closed Lost"]] }] },
                    { $gte: ["$expected_close_date", monthStart] },
                    { $lt: ["$expected_close_date", monthEnd] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          closedWonThisMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$stage", "Closed Won"] },
                    { $gte: ["$updatedAt", monthStart] },
                    { $lt: ["$updatedAt", monthEnd] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          closedLostThisMonth: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$stage", "Closed Lost"] },
                    { $gte: ["$updatedAt", monthStart] },
                    { $lt: ["$updatedAt", monthEnd] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          avgDealSize: {
            $cond: [
              { $gt: ["$openOpportunities", 0] },
              { $divide: ["$totalPipelineValue", "$openOpportunities"] },
              0,
            ],
          },
        },
      },
    ]);

    const kpis = summary ?? {
      totalPipelineValue: 0,
      weightedPipelineValue: 0,
      openOpportunities: 0,
      dealsAtRisk: 0,
      closingThisMonth: 0,
      closedWonThisMonth: 0,
      closedLostThisMonth: 0,
      avgDealSize: 0,
    };

    return NextResponse.json({ success: true, kpis });
  } catch (error: any) {
    console.error("GET Opportunity KPIs Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

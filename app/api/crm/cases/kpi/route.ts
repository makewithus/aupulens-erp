import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Types } from "mongoose";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";
import { isSlaCurrentlyBreached, startOfIndiaBusinessDay } from "@/lib/crm/slaEngine";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const tenantId = session.user.tenantId;
  const { searchParams } = req.nextUrl;
  const caseScope: Record<string, any> = { tenantId };
  if (searchParams.get("view") !== "all") {
    // Aggregation pipelines don't apply Mongoose's implicit ObjectId casting.
    // Keep this scope BSON-typed so count queries and aggregates see the same cases.
    if (!Types.ObjectId.isValid(session.user.id)) {
      return NextResponse.json({ success: false, error: "Invalid user session." }, { status: 401 });
    }
    caseScope.owner_id = new Types.ObjectId(session.user.id);
  }
  const status = searchParams.get("status");
  if (status === "open") caseScope.status = { $nin: ["Resolved", "Closed"] };
  else if (status === "resolved_closed") caseScope.status = { $in: ["Resolved", "Closed"] };
  else if (status) caseScope.status = status;

  const search = searchParams.get("search");
  if (search) {
    const words = search.trim().split(/\s+/).map((word) => word.replace(/[.*+?^\$\{\}()|[\]\\]/g, "\\$&"));
    caseScope.$and = words.map((word) => ({
      $or: [
        { title: { $regex: word, $options: "i" } },
        { case_number: { $regex: word, $options: "i" } },
        { description: { $regex: word, $options: "i" } },
      ],
    }));
  }

  const dateRange: Record<string, Date> = {};
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (dateFrom && !isNaN(Date.parse(dateFrom))) dateRange.$gte = new Date(dateFrom);
  if (dateTo && !isNaN(Date.parse(dateTo))) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    dateRange.$lte = end;
  }
  if (Object.keys(dateRange).length) caseScope.createdAt = dateRange;
  const withCaseScope = (filter: Record<string, any> = {}) => ({ $and: [caseScope, filter] });

  const now = new Date();
  const startOfDay = startOfIndiaBusinessDay(now);

  const [
    openCases,
    totalCases,
    breachedOpenCases,
    resolvedToday,
    escalations,
    reopenedCases,
    avgSatData,
    avgResTimeData,
    escalationsTodayData,
    recentCaseRows,
  ] = await Promise.all([
    CrmCase.countDocuments(withCaseScope({ status: { $nin: ['Resolved', 'Closed'] } })),
    CrmCase.countDocuments(caseScope),
    CrmCase.countDocuments(withCaseScope({ status: { $nin: ['Resolved', 'Closed'] }, sla_target_at: { $lt: now } })),
    CrmCase.countDocuments(withCaseScope({ status: { $in: ['Resolved', 'Closed'] }, resolvedAt: { $gte: startOfDay } })),
    CrmCase.countDocuments(withCaseScope({ escalation_level: { $gt: 0 } })),
    CrmCase.countDocuments(withCaseScope({ status: 'Reopened' })),
    CrmCase.aggregate([
      { $match: withCaseScope({ satisfaction_score: { $gte: 1, $lte: 5 } }) },
      { $group: { _id: null, avgScore: { $avg: "$satisfaction_score" } } }
    ]),
    CrmCase.aggregate([
      {
        $match: {
          ...withCaseScope({ status: { $in: ['Resolved', 'Closed'] } }),
          createdAt: { $type: "date" },
          resolvedAt: { $type: "date" },
          $expr: { $gte: ["$resolvedAt", "$createdAt"] },
        },
      },
      {
        $group: {
          _id: null,
          avgMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } },
          resolvedCount: { $sum: 1 },
        },
      }
    ]),
    CrmCase.aggregate([
      { $match: withCaseScope({ escalation_history: { $exists: true, $ne: [] } }) },
      { $unwind: "$escalation_history" },
      { $match: { "escalation_history.timestamp": { $gte: startOfDay } } },
      { $count: "count" },
    ]),
    CrmCase.find(caseScope)
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("account_id", "company_name")
      .lean(),
  ]);

  const avgSatScore = avgSatData.length > 0 ? avgSatData[0].avgScore.toFixed(1) : null;
  const avgResTimeMs = Math.max(0, avgResTimeData[0]?.avgMs || 0);
  const avgResTimeMinutes = Math.round(avgResTimeMs / 60000);
  const avgResTime = avgResTimeData[0]?.resolvedCount
    ? `${Math.floor(avgResTimeMinutes / 60)}h ${avgResTimeMinutes % 60}m`
    : "N/A";
  const escalationsToday = escalationsTodayData[0]?.count || 0;
  const slaBreaches = breachedOpenCases;

  return NextResponse.json({
    success: true,
    data: {
      openCases,
      totalCases,
      overdueCases: breachedOpenCases,
      slaBreaches,
      breachedOpenCases,
      resolvedToday,
      avgResTime,
      reopenedCases,
      avgSatScore,
      escalations,
      escalationsToday,
      recentCases: recentCaseRows.map((crmCase: any) => ({
        ...crmCase,
        sla_breached: isSlaCurrentlyBreached(crmCase, now),
      })),
    }
  });
}

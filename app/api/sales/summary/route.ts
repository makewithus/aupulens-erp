import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";
import DeliveryChallan from "@/models/DeliveryChallan";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

function calculateTrend(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET() {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const now = new Date();
    const last30Days = new Date(now);
    last30Days.setDate(now.getDate() - 30);
    const prev30Days = new Date(last30Days);
    prev30Days.setDate(last30Days.getDate() - 30);

    // Aggregation pipeline to get stats for current and previous periods
    const stats = await SaleOrder.aggregate([
      {
        $match: {
          tenantId,
          createdAt: { $gte: prev30Days },
        },
      },
      {
        $project: {
          status: 1,
          amountTotal: "$totals.amountTotal",
          period: {
            $cond: [
              { $gte: ["$createdAt", last30Days] },
              "current",
              "previous",
            ],
          },
        },
      },
      {
        $group: {
          _id: { status: "$status", period: "$period" },
          count: { $sum: 1 },
          revenue: { $sum: "$amountTotal" },
        },
      },
    ]);

    // Process aggregation results
    let currentOrders = 0;
    let prevOrders = 0;
    let currentRevenue = 0;
    let prevRevenue = 0;
    let currentQuotes = 0;
    let prevQuotes = 0;

    stats.forEach((item) => {
      const isOrder = ["sale", "done"].includes(item._id.status);
      const isQuote = [DOCUMENT_STATUS.DRAFT, DOCUMENT_STATUS.PENDING_APPROVAL].includes(item._id.status);
      const isCurrent = item._id.period === "current";

      if (isOrder) {
        if (isCurrent) {
          currentOrders += item.count;
          currentRevenue += item.revenue;
        } else {
          prevOrders += item.count;
          prevRevenue += item.revenue;
        }
      } else if (isQuote) {
        if (isCurrent) currentQuotes += item.count;
        else prevQuotes += item.count;
      }
    });

    // Pending Deliveries (Snapshot, no trend usually, or could count created dc? stick to pending snapshot)
    const pendingDC = await DeliveryChallan.countDocuments({
      status: DOCUMENT_STATUS.DRAFT,
      tenantId,
    });

    return NextResponse.json({
      totalOrders: currentOrders, // Showing current active period stats usually
      totalQuotations: currentQuotes,
      totalRevenue: currentRevenue,
      deliveriesPending: pendingDC,
      trends: {
        revenue: calculateTrend(currentRevenue, prevRevenue),
        orders: calculateTrend(currentOrders, prevOrders),
        quotations: calculateTrend(currentQuotes, prevQuotes),
      },
    });
  } catch (error) {
    console.error("Error fetching sales summary:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

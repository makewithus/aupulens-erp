import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "orders_trend";
    const dateRange = Number(searchParams.get("dateRange") || "30");

    // Aggregation boundaries
    const days = Math.min(Math.max(dateRange, 7), 365);

    // UTC based calculation
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    // Fetch Orders (status: sale, done)
    const orders = await SaleOrder.find({
      tenantId,
      status: { $in: [DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.CLOSED] },
      createdAt: { $gte: from },
    }).lean();

    // Fetch Quotations (status: draft, sent)
    const quotations = await SaleOrder.find({
      tenantId,
      status: { $in: [DOCUMENT_STATUS.DRAFT, DOCUMENT_STATUS.PENDING_APPROVAL] },
      createdAt: { $gte: from },
    }).lean();

    // Debug info gathering
    const distinctStatuses = await SaleOrder.distinct("status", { tenantId });
    const totalDocs = await SaleOrder.countDocuments({ tenantId });
    const debugInfo = {
      from: from.toISOString(),
      totalDocsInDB: totalDocs,
      statusesFound: distinctStatuses,
      fetchedOrders: orders.length,
      fetchedQuotes: quotations.length,
      sampleDoc: orders[0] || quotations[0],
      serverTime: new Date().toISOString(),
    };

    if (type === "product_performance") {
      const productStats: Record<
        string,
        { revenue: number; quantity: number }
      > = {};
      orders.forEach((o: any) => {
        if (o.orderLines) {
          o.orderLines.forEach((line: any) => {
            const name = line.name || "Unknown Product";
            if (!productStats[name])
              productStats[name] = { revenue: 0, quantity: 0 };
            productStats[name].revenue += line.priceSubtotal || 0;
            productStats[name].quantity += line.productQty || 0;
          });
        }
      });

      const data = Object.entries(productStats)
        .map(([name, stats]) => ({ name, ...stats }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return NextResponse.json({ data, debug: debugInfo });
    }

    if (type.includes("status_breakdown")) {
      const all = [...orders, ...quotations];
      const statusCounts = all.reduce((acc: Record<string, number>, o: any) => {
        acc[o.status] = (acc[o.status] || 0) + 1;
        return acc;
      }, {});
      const pie = Object.entries(statusCounts).map(([name, value]) => ({
        name,
        value,
      }));
      return NextResponse.json({ data: pie, debug: debugInfo });
    }

    // Default Trend Analysis (orders_trend, revenue_trend, etc.)
    const byDate: Record<
      string,
      { orders: number; revenue: number; quotations: number }
    > = {};
    for (let i = 0; i <= days; i++) {
      const d = new Date(from);
      d.setUTCDate(from.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { orders: 0, revenue: 0, quotations: 0 };
    }

    orders.forEach((o: any) => {
      if (!o.createdAt) return;
      try {
        const key = new Date(o.createdAt).toISOString().slice(0, 10);
        if (byDate[key]) {
          byDate[key].orders += 1;
          const revenue = o.totals?.amountTotal || 0;
          byDate[key].revenue += revenue;
        }
      } catch (e) {}
    });

    quotations.forEach((q: any) => {
      if (!q.createdAt) return;
      try {
        const key = new Date(q.createdAt).toISOString().slice(0, 10);
        if (byDate[key]) byDate[key].quotations += 1;
      } catch (e) {}
    });

    const data = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return NextResponse.json({ data, debug: debugInfo });
  } catch (error) {
    console.error("Error in sales visualization API:", error);
    return NextResponse.json(
      { error: "Internal server error", data: [] },
      { status: 500 },
    );
  }
}

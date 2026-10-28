import { issuedInvoiceFilter, invoiceRevenueExpression, invoiceGrossValueExpression } from "@/lib/sales/invoiceEligibility";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import DeliveryChallan from "@/models/sales/DeliveryChallan";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { REAL_ORDER_MATCH } from "@/lib/sales/orderEligibility";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

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

    const cacheKey = `sales_summary:${tenantId}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const now = new Date();
    const last30Days = new Date(now);
    last30Days.setDate(now.getDate() - 30);
    const prev30Days = new Date(last30Days);
    prev30Days.setDate(last30Days.getDate() - 30);

    const [
      currentOrders,
      prevOrders,
      currentQuotes,
      prevQuotes,
      currentInvoiceAgg,
      prevInvoiceAgg,
      pendingOrders,
    ] = await Promise.all([
      SaleOrder.countDocuments({ tenantId, createdAt: { $gte: last30Days }, ...REAL_ORDER_MATCH }),
      SaleOrder.countDocuments({ tenantId, createdAt: { $gte: prev30Days, $lt: last30Days }, ...REAL_ORDER_MATCH }),
      SalesQuotation.countDocuments({ tenantId, createdAt: { $gte: last30Days } }),
      SalesQuotation.countDocuments({ tenantId, createdAt: { $gte: prev30Days, $lt: last30Days } }),
      (SalesInvoice as any).aggregate([
        { $match: { tenantId, invoiceDate: { $gte: last30Days, $lte: now }, ...issuedInvoiceFilter() } },
        { $group: { _id: null, total: { $sum: invoiceRevenueExpression }, grossTotal: { $sum: invoiceGrossValueExpression } } },
      ]),
      (SalesInvoice as any).aggregate([
        { $match: { tenantId, invoiceDate: { $gte: prev30Days, $lt: last30Days }, ...issuedInvoiceFilter() } },
        { $group: { _id: null, total: { $sum: invoiceRevenueExpression }, grossTotal: { $sum: invoiceGrossValueExpression } } },
      ]),
      SaleOrder.find({
        tenantId,
        ...REAL_ORDER_MATCH,
        status: { $nin: [DOCUMENT_STATUS.CANCELLED, "draft"] },
        salesOrderStatus: { $nin: ["cancelled", "closed"] },
        shipmentStatus: { $nin: ["shipped", "fulfilled"] },
      }).select("_id deliveryChallanId fulfillment.deliveryChallanId").lean(),
    ]);

    const linkedDcIds = new Set(
      pendingOrders
        .map((o: any) => o.deliveryChallanId || o.fulfillment?.deliveryChallanId)
        .filter(Boolean)
        .map(String)
    );

    const unlinkedPendingDcs = await DeliveryChallan.countDocuments({
      tenantId,
      status: "pending",
      ...(linkedDcIds.size > 0 ? { _id: { $nin: Array.from(linkedDcIds) } } : {}),
    });

    const pendingDC = pendingOrders.length + unlinkedPendingDcs;

    const currentRevenue = currentInvoiceAgg[0]?.total || 0;
    const currentGrossInvoiced = currentInvoiceAgg[0]?.grossTotal || 0;
    const prevRevenue = prevInvoiceAgg[0]?.total || 0;
    const prevGrossInvoiced = prevInvoiceAgg[0]?.grossTotal || 0;

    const payload = {
      totalOrders: currentOrders,
      totalQuotations: currentQuotes,
      totalRevenue: currentRevenue,
      totalGrossInvoiced: currentGrossInvoiced,
      deliveriesPending: pendingDC,
      trends: {
        revenue: calculateTrend(currentRevenue, prevRevenue),
        grossInvoiced: calculateTrend(currentGrossInvoiced, prevGrossInvoiced),
        orders: calculateTrend(currentOrders, prevOrders),
        quotations: calculateTrend(currentQuotes, prevQuotes),
      },
    };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching sales summary:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

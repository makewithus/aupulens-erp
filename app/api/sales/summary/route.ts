import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import DeliveryChallan from "@/models/sales/DeliveryChallan";
import { DOCUMENT_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

function calculateTrend(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// A SaleOrder row is a real, confirmed order regardless of which UI created
// it: the modern Zoho-style /sales/sales-orders flow tags `salesOrderStatus`
// (never sets the legacy `status` field), while the legacy Odoo-style
// /sales/orders flow confirms via `status`. Every row created through the
// modern flow otherwise sits at the untouched `status: "draft"` schema
// default forever, which previously made real orders invisible here.
const REAL_ORDER_MATCH = {
  $or: [
    { salesOrderStatus: { $ne: null } },
    { status: { $in: [DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.CLOSED] } },
    // A handful of older rows in this collection still carry the classic
    // Odoo sale.order state values ("sale"/"done") from before the
    // DOCUMENT_STATUS enum migration — the schema enum now rejects writing
    // these, but Mongoose doesn't re-validate on read, so they still exist
    // and would otherwise be silently excluded here.
    { status: { $in: ["sale", "done"] } },
  ],
};

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

    const [
      currentOrders,
      prevOrders,
      currentQuotes,
      prevQuotes,
      currentInvoiceAgg,
      prevInvoiceAgg,
      pendingDC,
    ] = await Promise.all([
      SaleOrder.countDocuments({ tenantId, createdAt: { $gte: last30Days }, ...REAL_ORDER_MATCH }),
      SaleOrder.countDocuments({ tenantId, createdAt: { $gte: prev30Days, $lt: last30Days }, ...REAL_ORDER_MATCH }),
      SalesQuotation.countDocuments({ tenantId, createdAt: { $gte: last30Days } }),
      SalesQuotation.countDocuments({ tenantId, createdAt: { $gte: prev30Days, $lt: last30Days } }),
      (SalesInvoice as any).aggregate([
        { $match: { tenantId, createdAt: { $gte: last30Days }, status: { $ne: SALES_INVOICE_STATUS.CANCELLED } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      (SalesInvoice as any).aggregate([
        { $match: { tenantId, createdAt: { $gte: prev30Days, $lt: last30Days }, status: { $ne: SALES_INVOICE_STATUS.CANCELLED } } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      DeliveryChallan.countDocuments({ status: DOCUMENT_STATUS.DRAFT, tenantId }),
    ]);

    const currentRevenue = currentInvoiceAgg[0]?.total || 0;
    const prevRevenue = prevInvoiceAgg[0]?.total || 0;

    return NextResponse.json({
      totalOrders: currentOrders,
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

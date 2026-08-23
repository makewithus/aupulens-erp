import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";
import SalesQuotation from "@/models/SalesQuotation";
import { SalesInvoice } from "@/models/SalesInvoice";
import { DOCUMENT_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

// A SaleOrder row is a real, confirmed order regardless of which UI created
// it — see the matching comment in app/api/sales/summary/route.ts. Filtering
// only on the legacy `status` field (as this route previously did) misses
// every order created via the modern /sales/sales-orders flow, since that
// flow never touches `status` and leaves it at its unset schema default.
const REAL_ORDER_MATCH = {
  $or: [
    { salesOrderStatus: { $ne: null } },
    { status: { $in: [DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.CLOSED] } },
    // See the matching comment in app/api/sales/summary/route.ts — a few
    // older rows still carry pre-migration Odoo state values.
    { status: { $in: ["sale", "done"] } },
  ],
};

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
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "orders_trend";
    const dateRange = Number(searchParams.get("dateRange") || "30");

    const days = Math.min(Math.max(dateRange, 7), 365);

    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    // Real confirmed orders (both the legacy Odoo-style and modern
    // Zoho-style creation flows), real quotations, and real invoiced
    // revenue (excluding cancelled) — the three sources the AI Assistant
    // and RAG layer already read correctly (see docs/_context/MEMORY.md).
    const [orders, quotations, invoices] = await Promise.all([
      SaleOrder.find({ tenantId, createdAt: { $gte: from }, ...REAL_ORDER_MATCH }).lean(),
      SalesQuotation.find({ tenantId, createdAt: { $gte: from } }).select("status createdAt").lean(),
      (SalesInvoice as any).find({ tenantId, createdAt: { $gte: from }, status: { $ne: SALES_INVOICE_STATUS.CANCELLED } }).select("totalAmount createdAt").lean(),
    ]);

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

      return NextResponse.json({ data });
    }

    if (type.includes("status_breakdown")) {
      const statusCounts: Record<string, number> = {};
      orders.forEach((o: any) => {
        const status = o.salesOrderStatus || o.status;
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      });
      quotations.forEach((q: any) => {
        statusCounts[q.status] = (statusCounts[q.status] || 0) + 1;
      });
      const pie = Object.entries(statusCounts).map(([name, value]) => ({
        name,
        value,
      }));
      return NextResponse.json({ data: pie });
    }

    // Default Trend Analysis (orders_trend, revenue_trend, quotation_to_order)
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
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].orders += 1;
    });

    invoices.forEach((inv: any) => {
      if (!inv.createdAt) return;
      const key = new Date(inv.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].revenue += inv.totalAmount || 0;
    });

    quotations.forEach((q: any) => {
      if (!q.createdAt) return;
      const key = new Date(q.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].quotations += 1;
    });

    const data = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error in sales visualization API:", error);
    return NextResponse.json(
      { error: "Internal server error", data: [] },
      { status: 500 },
    );
  }
}

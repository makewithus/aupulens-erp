import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { issuedInvoiceFilter, invoiceRevenueFromDocument } from "@/lib/sales/invoiceEligibility";

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
    // A range of 7 means seven calendar dates including today.
    from.setUTCDate(from.getUTCDate() - (days - 1));
    from.setUTCHours(0, 0, 0, 0);

    // Orders mirror the records shown in Sales Orders; quotations and
    // recognized invoice revenue use their own persisted document sources.
    const [orders, quotations, invoices] = await Promise.all([
      // The sales orders table filters by header.dateOrder. Use that business
      // date for chart buckets as well, falling back to createdAt only for
      // older records that have no order date.
      SaleOrder.find({
        tenantId,
        $or: [
          { "header.dateOrder": { $gte: from } },
          { "header.dateOrder": { $exists: false }, createdAt: { $gte: from } },
          { "header.dateOrder": null, createdAt: { $gte: from } },
        ],
      }).lean(),
      SalesQuotation.find({ tenantId, createdAt: { $gte: from } }).select("status createdAt").lean(),
      (SalesInvoice as any).find({ tenantId, invoiceDate: { $gte: from }, ...issuedInvoiceFilter() }).select("totalAmount taxableAmount taxes.gstBreakup invoiceDate createdAt").lean(),
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
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setUTCDate(from.getUTCDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { orders: 0, revenue: 0, quotations: 0 };
    }

    orders.forEach((o: any) => {
      const orderDate = o.header?.dateOrder || o.createdAt;
      if (!orderDate) return;
      const key = new Date(orderDate).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].orders += 1;
    });

    invoices.forEach((inv: any) => {
      const dateVal = inv.invoiceDate || inv.createdAt;
      if (!dateVal) return;
      const key = new Date(dateVal).toISOString().slice(0, 10);
      if (byDate[key]) {
        // Match Finance, Admin, and Sales summary revenue: GST collected for
        // the tax authority is not business revenue.
        byDate[key].revenue += invoiceRevenueFromDocument(inv);
      }
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

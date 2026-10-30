import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { issuedInvoiceFilter, invoiceRevenueFromDocument } from "@/lib/sales/invoiceEligibility";
import { REAL_ORDER_MATCH } from "@/lib/sales/orderEligibility";

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
    const groupBy = searchParams.get("groupBy") || "day";

    const days = Math.min(Math.max(dateRange, 7), 365);

    const from = new Date();
    // A range of 7 means seven calendar dates including today.
    from.setUTCDate(from.getUTCDate() - (days - 1));
    from.setUTCHours(0, 0, 0, 0);
    const until = new Date();
    const businessDateFilter = {
      $or: [
        { "header.dateOrder": { $gte: from, $lte: until } },
        { "header.dateOrder": { $exists: false }, createdAt: { $gte: from, $lte: until } },
        { "header.dateOrder": null, createdAt: { $gte: from, $lte: until } },
      ],
    };

    // Orders mirror the records shown in Sales Orders; quotations and
    // recognized invoice revenue use their own persisted document sources.
    const [orders, quotations, invoices, allOrdersForStatus] = await Promise.all([
      // The sales orders table filters by header.dateOrder. Use that business
      // date for chart buckets as well, falling back to createdAt only for
      // older records that have no order date.
      SaleOrder.find({
        tenantId,
        $and: [REAL_ORDER_MATCH, businessDateFilter],
      }).select("header.dateOrder createdAt totals.amountTotal orderLines.name orderLines.productQty orderLines.priceSubtotal quoteId quoteNumber").lean(),
      SalesQuotation.find({ tenantId, createdAt: { $gte: from, $lte: until } }).select("_id quoteNumber saleOrderId status createdAt").lean(),
      (SalesInvoice as any).find({ tenantId, invoiceDate: { $gte: from, $lte: until }, ...issuedInvoiceFilter() }).select("totalAmount taxableAmount taxes.gstBreakup invoiceDate createdAt").lean(),
      type.includes("status_breakdown")
        ? SaleOrder.find({ tenantId, ...businessDateFilter }).select("salesOrderStatus status").lean()
        : Promise.resolve([]),
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
      allOrdersForStatus.forEach((o: any) => {
        const legacyAliases: Record<string, string> = { sale: "confirmed", done: "closed", cancel: "void" };
        const status = o.salesOrderStatus || legacyAliases[o.status] || o.status || "unspecified";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
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
    const bucketKeyFor = (date: Date) => {
      const bucket = new Date(date);
      if (groupBy === "month") {
        bucket.setUTCDate(1);
      } else if (groupBy === "week") {
        bucket.setUTCDate(bucket.getUTCDate() - ((bucket.getUTCDay() + 6) % 7));
      }
      return bucket.toISOString().slice(0, 10);
    };

    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setUTCDate(from.getUTCDate() + i);
      const key = bucketKeyFor(d);
      byDate[key] = { orders: 0, revenue: 0, quotations: 0 };
    }

    orders.forEach((o: any) => {
      const orderDate = o.header?.dateOrder || o.createdAt;
      if (!orderDate) return;
      const key = bucketKeyFor(new Date(orderDate));
      if (byDate[key] && !type.includes("quotation_to_order")) byDate[key].orders += 1;
    });

    invoices.forEach((inv: any) => {
      const dateVal = inv.invoiceDate || inv.createdAt;
      if (!dateVal) return;
      const key = bucketKeyFor(new Date(dateVal));
      if (byDate[key]) {
        // Match Finance, Admin, and Sales summary revenue: GST collected for
        // the tax authority is not business revenue.
        byDate[key].revenue += invoiceRevenueFromDocument(inv);
      }
    });

    quotations.forEach((q: any) => {
      if (!q.createdAt) return;
      const key = bucketKeyFor(new Date(q.createdAt));
      if (byDate[key]) byDate[key].quotations += 1;
    });

    if (type.includes("quotation_to_order") && quotations.length > 0) {
      const quoteIds = quotations.map((quote: any) => quote._id);
      const quoteNumbers = quotations.map((quote: any) => quote.quoteNumber).filter(Boolean);
      const orderIds = quotations.map((quote: any) => quote.saleOrderId).filter(Boolean);
      const quoteLinks: any[] = [];
      if (quoteIds.length) quoteLinks.push({ quoteId: { $in: quoteIds } });
      if (quoteNumbers.length) quoteLinks.push({ quoteNumber: { $in: quoteNumbers } });
      if (orderIds.length) quoteLinks.push({ _id: { $in: orderIds } });
      const linkedOrders = quoteLinks.length
        ? await SaleOrder.find({ tenantId, $and: [REAL_ORDER_MATCH, { $or: quoteLinks }] })
            .select("_id quoteId quoteNumber")
            .lean()
        : [];
      const convertedQuoteIds = new Set<string>();
      const convertedQuoteNumbers = new Set<string>();
      const linkedOrderIds = new Set(linkedOrders.map((order: any) => String(order._id)));
      for (const order of linkedOrders as any[]) {
        if (order.quoteId) convertedQuoteIds.add(String(order.quoteId));
        if (order.quoteNumber) convertedQuoteNumbers.add(order.quoteNumber);
      }
      for (const quote of quotations as any[]) {
        const converted = linkedOrderIds.has(String(quote.saleOrderId || "")) ||
          convertedQuoteIds.has(String(quote._id)) ||
          convertedQuoteNumbers.has(quote.quoteNumber);
        if (!converted) continue;
        const key = bucketKeyFor(new Date(quote.createdAt));
        if (byDate[key]) byDate[key].orders += 1;
      }
    }

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

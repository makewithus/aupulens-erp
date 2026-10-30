import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import SaleOrder from '@/models/sales/SaleOrder';
import SalesInvoice from '@/models/sales/SalesInvoice';
import { REAL_ORDER_MATCH } from "@/lib/sales/orderEligibility";
import { issuedInvoiceFilter, invoiceRevenueExpression } from "@/lib/sales/invoiceEligibility";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session || !session.user || (session.user.role !== 'admin' && session.user.role !== 'sales')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const cacheKey = `sales_analytics:${tenantId}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();

    const requestedDays = Number(req.nextUrl.searchParams.get("days") || "90");
    const days = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.trunc(requestedDays), 7), 365) : 90;
    const rangeEnd = new Date();
    const rangeStart = new Date(rangeEnd);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (days - 1));
    rangeStart.setUTCHours(0, 0, 0, 0);
    const orderDateRange = {
      $and: [
        REAL_ORDER_MATCH,
        {
          $or: [
            { "header.dateOrder": { $gte: rangeStart, $lte: rangeEnd } },
            { "header.dateOrder": { $exists: false }, createdAt: { $gte: rangeStart, $lte: rangeEnd } },
            { "header.dateOrder": null, createdAt: { $gte: rangeStart, $lte: rangeEnd } },
          ],
        },
      ],
    };

    // These aggregations are independent of each other, so run them concurrently
    const [ordersData, revenueData, topProducts, dailyOrdersData] = await Promise.all([
      SaleOrder.aggregate([
        {
          $match: {
            tenantId,
            ...orderDateRange,
          }
        },
        { $addFields: { orderDate: { $ifNull: ["$header.dateOrder", "$createdAt"] } } },
        {
          $group: {
            _id: {
              month: { $month: '$orderDate' },
              year: { $year: '$orderDate' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Aggregate recognized revenue by month (excluding GST)
      SalesInvoice.aggregate([
        {
          $match: {
            tenantId,
            invoiceDate: { $gte: rangeStart, $lte: rangeEnd },
            ...issuedInvoiceFilter()
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$invoiceDate' },
              year: { $year: '$invoiceDate' }
            },
            amount: { $sum: invoiceRevenueExpression }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),


      SaleOrder.aggregate([
        {
          $match: {
            tenantId,
            ...orderDateRange,
          }
        },
        { $unwind: '$orderLines' },
        {
          $group: {
            _id: '$orderLines.name',
            value: { $sum: '$orderLines.productQty' }
          }
        },
        { $sort: { value: -1 } },
        { $limit: 5 },
        {
          $project: {
            _id: 0,
            name: '$_id',
            value: 1
          }
        }
      ]),

      SaleOrder.aggregate([
        {
          $match: {
            tenantId,
            ...orderDateRange,
          }
        },
        { $addFields: { orderDate: { $ifNull: ["$header.dateOrder", "$createdAt"] } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate", timezone: "UTC" } },
            count: { $sum: 1 },
            value: { $sum: { $ifNull: ["$totals.amountTotal", 1] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Format data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const orders = ordersData.map(item => ({
      month: `${monthNames[item._id.month - 1]} '${String(item._id.year).slice(-2)}`,
      count: item.count
    }));

    const revenue = revenueData.map(item => ({
      month: `${monthNames[item._id.month - 1]} '${String(item._id.year).slice(-2)}`,
      date: `${item._id.year}-${String(item._id.month).padStart(2, "0")}-01`,
      amount: Math.round(item.amount)
    }));

    const dailyOrderMap = new Map(dailyOrdersData.map((item) => [item._id, item]));
    const dailyOrders = Array.from({ length: days }, (_, index) => {
      const date = new Date(rangeStart);
      date.setUTCDate(date.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      const item = dailyOrderMap.get(key);
      return { date: key, count: item?.count || 0, value: item?.value || 0 };
    });

    const payload = {
      orders,
      revenue,
      topProducts,
      dailyOrders
    };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);

  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

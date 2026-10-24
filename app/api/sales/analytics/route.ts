import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import SaleOrder from '@/models/sales/SaleOrder';
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session || !session.user || (session.user.role !== 'admin' && session.user.role !== 'sales')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
await connectDB();

    // Get last 6 months data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // These aggregations are independent of each other, so run them concurrently
    const [ordersData, revenueData, topProducts, dailyOrdersData] = await Promise.all([
      // Aggregate orders count by month
      SaleOrder.aggregate([
        {
          $match: {
            tenantId,
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$createdAt' },
              year: { $year: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Aggregate revenue by month
      SaleOrder.aggregate([
        {
          $match: {
            tenantId,
            createdAt: { $gte: sixMonthsAgo },
            status: { $nin: [DOCUMENT_STATUS.CANCELLED, DOCUMENT_STATUS.DRAFT] }
          }
        },
        {
          $group: {
            _id: {
              month: { $month: '$createdAt' },
              year: { $year: '$createdAt' }
            },
            amount: { $sum: '$totals.amountTotal' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Get top products
      SaleOrder.aggregate([
        {
          $match: {
            tenantId,
            createdAt: { $gte: sixMonthsAgo }
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

      // Daily orders for DailyBrickBarChart (last 90 days)
      SaleOrder.aggregate([
        {
          $match: {
            tenantId,
            createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
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
      month: monthNames[item._id.month - 1],
      count: item.count
    }));

    const revenue = revenueData.map(item => ({
      month: monthNames[item._id.month - 1],
      amount: Math.round(item.amount)
    }));

    const dailyOrders = dailyOrdersData.map(item => ({
      date: item._id,
      count: item.count,
      value: item.value
    }));

    return NextResponse.json({
      orders,
      revenue,
      topProducts,
      dailyOrders
    });

  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

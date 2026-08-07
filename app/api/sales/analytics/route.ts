import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import SaleOrder from '@/models/SaleOrder';
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

    // Aggregate orders count by month
    const ordersData = await SaleOrder.aggregate([
      {
        $match: {
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
    ]);

    // Aggregate revenue by month
    const revenueData = await SaleOrder.aggregate([
      {
        $match: {
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
    ]);

    // Get top products
    const topProducts = await SaleOrder.aggregate([
      {
        $match: {
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

    return NextResponse.json({
      orders,
      revenue,
      topProducts: topProducts.length > 0 ? topProducts : [
        { name: 'Product A', value: 450 },
        { name: 'Product B', value: 380 },
        { name: 'Product C', value: 320 },
        { name: 'Product D', value: 280 },
      ]
    });

  } catch (error) {
    console.error('Error fetching sales analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

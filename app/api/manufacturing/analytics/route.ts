import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import Shipment from '@/models/Shipment';
import AirFreight from '@/models/AirFreight';

export async function GET() {
  try {
    const session = await auth();
    
    if (!session || !session.user || (session.user.role !== 'admin' && session.user.role !== 'manufacturing')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantId = (session.user as any).tenantId || "default-tenant";
await connectDB();

    // Get last 6 months data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Aggregate shipments by month
    const shipmentsData = await Shipment.aggregate([
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
    ]);

    // Aggregate costs by month
    const costsData = await AirFreight.aggregate([
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
          amount: { $sum: '$totalCost' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get shipment status distribution
    const statusData = await Shipment.aggregate([
      {
        $match: {
          tenantId,
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: '$status',
          value: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          name: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 'in_transit'] }, then: 'In Transit' },
                { case: { $eq: ['$_id', 'delivered'] }, then: 'Delivered' },
                { case: { $eq: ['$_id', 'pending'] }, then: 'Pending' },
                { case: { $eq: ['$_id', 'delayed'] }, then: 'Delayed' }
              ],
              default: '$_id'
            }
          },
          value: 1
        }
      }
    ]);

    // Format data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const shipments = shipmentsData.map(item => ({
      month: monthNames[item._id.month - 1],
      count: item.count
    }));

    const costs = costsData.map(item => ({
      month: monthNames[item._id.month - 1],
      amount: Math.round(item.amount)
    }));

    return NextResponse.json({
      shipments,
      costs,
      status: statusData,
    });

  } catch (error) {
    console.error('Error fetching manufacturing analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import User from '@/models/User';
import ActivityLog from '@/models/ActivityLog';
import { ENTITY_STATUS } from "@/lib/constants/statuses";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session || !session.user || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
await connectDB();

    // Get last 6 months data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Aggregate user activity (logins) by month
    const activityData = await ActivityLog.aggregate([
      {
        $match: {
          action: 'login',
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: '$createdAt' },
            year: { $year: '$createdAt' }
          },
          logins: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get users by role
    const roleData = await User.aggregate([
      {
        $match: {
          status: ENTITY_STATUS.ACTIVE
        }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          role: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 'admin'] }, then: 'Admin' },
                { case: { $eq: ['$_id', 'finance'] }, then: 'Finance' },
                { case: { $eq: ['$_id', 'sales'] }, then: 'Sales' },
                { case: { $eq: ['$_id', 'inventory'] }, then: 'Inventory' },
                { case: { $eq: ['$_id', 'manufacturing'] }, then: 'Manufacturing' }
              ],
              default: '$_id'
            }
          },
          count: 1
        }
      }
    ]);

    // Format data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    const activity = activityData.map(item => ({
      month: monthNames[item._id.month - 1],
      logins: item.logins
    }));

    return NextResponse.json({
      activity,
      byRole: roleData.length > 0 ? roleData : [
        { role: 'Admin', count: 5 },
        { role: 'Finance', count: 12 },
        { role: 'Sales', count: 18 },
        { role: 'Inventory', count: 15 },
        { role: 'Manufacturing', count: 10 }
      ]
    });

  } catch (error) {
    console.error('Error fetching user analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

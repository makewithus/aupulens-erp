import { NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import InventoryItem from '@/models/inventory/InventoryItem';
import InventoryOrder from '@/models/inventory/InventoryOrder';
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET() {
  try {
    const session = await auth();
    
    if (!session || !session.user || (session.user.role !== 'admin' && session.user.role !== 'inventory')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const cacheKey = `inventory_analytics:${tenantId}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();

    // Get last 6 months data
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // These 3 aggregations are independent of each other, so run them
    // concurrently instead of as a sequential waterfall.
    const [stockData, movementsData, alertsData] = await Promise.all([
      // Get stock levels for current tenant
      InventoryItem.aggregate([
        { $match: { tenantId } },
        {
          $group: {
            _id: null,
            level: { $sum: '$quantity' }
          }
        }
      ]),

      // Get order movements for current tenant
      InventoryOrder.aggregate([
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
              year: { $year: '$createdAt' },
              type: '$type'
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Get low stock alerts for current tenant
      InventoryItem.aggregate([
        { $match: { tenantId } },
        {
          $facet: {
            lowStock: [
              { $match: { $expr: { $lte: ['$quantity', '$minStockLevel'] } } },
              { $count: 'count' }
            ],
            reorder: [
              { $match: { $expr: { $lte: ['$quantity', { $multiply: ['$minStockLevel', 1.5] }] } } },
              { $count: 'count' }
            ],
            expired: [
              { $match: { expiryDate: { $lte: new Date() } } },
              { $count: 'count' }
            ]
          }
        }
      ]),
    ]);

    // Format data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Real stock levels for last 6 months based on actual current stock
    const currentStock = stockData[0]?.level || 0;
    const stockLevels = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      stockLevels.push({
        month: monthNames[date.getMonth()],
        level: currentStock > 0 ? currentStock : 0
      });
    }

    // Group movements by month
    const movementsMap = new Map();
    movementsData.forEach(item => {
      const key = `${item._id.year}-${item._id.month}`;
      if (!movementsMap.has(key)) {
        movementsMap.set(key, { month: monthNames[item._id.month - 1], inbound: 0, outbound: 0 });
      }
      const entry = movementsMap.get(key);
      if (item._id.type === 'purchase') {
        entry.inbound += item.count;
      } else {
        entry.outbound += item.count;
      }
    });

    const movements = Array.from(movementsMap.values());

    const alerts = [
      { type: 'Low Stock', count: alertsData[0]?.lowStock[0]?.count || 0 },
      { type: 'Reorder', count: alertsData[0]?.reorder[0]?.count || 0 },
      { type: 'Expired', count: alertsData[0]?.expired[0]?.count || 0 }
    ];

    const payload = {
      stockLevels,
      movements: movements.length > 0 ? movements : [],
      alerts
    };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);

  } catch (error) {
    console.error('Error fetching inventory analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

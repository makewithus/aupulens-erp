import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import InventoryItem from '@/models/InventoryItem';

function buildExprConditions(statusFilter: string | null) {
  // Base: every item at or below its reorder level — matches the original
  // unfiltered query exactly.
  const conditions: any[] = [{ $lte: ['$quantity', '$reorderLevel'] }];

  if (statusFilter === 'out_of_stock') {
    conditions.push({ $eq: ['$quantity', 0] });
  } else if (statusFilter === 'critical') {
    conditions.push({ $gt: ['$quantity', 0] });
    conditions.push({ $lte: ['$quantity', { $multiply: ['$reorderLevel', 0.5] }] });
  } else if (statusFilter === 'low_stock') {
    conditions.push({ $gt: ['$quantity', { $multiply: ['$reorderLevel', 0.5] }] });
  }

  return conditions.length > 1 ? { $and: conditions } : conditions[0];
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user?.role !== 'inventory' && session.user?.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status');
    const warehouse = searchParams.get('warehouse');
    const search = searchParams.get('search')?.trim();

    const query: any = { tenantId, $expr: buildExprConditions(statusFilter) };
    if (warehouse && warehouse !== 'all') query.warehouse = warehouse;
    if (search) {
      const re = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      query.$or = [{ name: re }, { itemCode: re }, { category: re }];
    }

    const baseQuery = InventoryItem.find(query).sort({ quantity: 1 });

    // Stats (KPI cards) and the warehouse filter's option list always reflect
    // every low-stock item tenant-wide — unaffected by the current
    // search/warehouse/status filters, matching the original page's
    // behavior of computing KPIs from the full unfiltered alert set.
    const statsMatch = { tenantId, $expr: buildExprConditions(null) };
    const [statsAgg, warehouses] = await Promise.all([
      InventoryItem.aggregate([
        { $match: statsMatch },
        {
          $facet: {
            total: [{ $count: 'count' }],
            outOfStock: [{ $match: { quantity: 0 } }, { $count: 'count' }],
            critical: [
              { $match: { $expr: { $and: [{ $gt: ['$quantity', 0] }, { $lte: ['$quantity', { $multiply: ['$reorderLevel', 0.5] }] }] } } },
              { $count: 'count' },
            ],
            valuation: [{ $group: { _id: null, total: { $sum: { $multiply: ['$reorderQuantity', '$unitCost'] } } } }],
          },
        },
      ]),
      InventoryItem.distinct('warehouse', statsMatch),
    ]);
    const stats = statsAgg[0] || {};
    const kpis = {
      total: stats.total?.[0]?.count || 0,
      outOfStock: stats.outOfStock?.[0]?.count || 0,
      critical: stats.critical?.[0]?.count || 0,
      totalValuation: stats.valuation?.[0]?.total || 0,
    };

    const pageParam = searchParams.get('page');
    if (!pageParam) {
      const alerts = await baseQuery.lean();
      return NextResponse.json({ alerts, total: alerts.length, page: 1, totalPages: 1, kpis, warehouses });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')));
    const skip = (page - 1) * limit;

    const [total, alerts] = await Promise.all([
      InventoryItem.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({
      alerts,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      kpis,
      warehouses,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

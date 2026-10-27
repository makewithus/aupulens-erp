import { NextRequest, NextResponse } from 'next/server';
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from '@/auth';
import connectDB from '@/lib/db';
import InventoryItem from '@/models/inventory/InventoryItem';
import Product from '@/models/inventory/Product';
import Stock from '@/models/inventory/Stock';
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user?.role !== 'inventory' && session.user?.role !== 'admin')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status') || '';
    const warehouse = searchParams.get('warehouse') || '';
    const search = searchParams.get('search')?.trim() || '';
    const pageKey = searchParams.get('page') || 'all';
    const limitKey = searchParams.get('limit') || 'all';

    const cacheKey = `inv-alerts:${tenantId}:${statusFilter}:${warehouse}:${search}:${pageKey}:${limitKey}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();

    // 1. Fetch tracked products, stock ledger balances, and any existing InventoryItems concurrently
    const [trackedProducts, stockAgg, existingInvItems] = await Promise.all([
      Product.find({
        tenantId,
        "tab_general_information.type": { $ne: "service" },
        status: { $ne: "archived" },
      }).lean(),
      Stock.aggregate([
        { $match: { tenantId } },
        {
          $group: {
            _id: "$product",
            quantity: { $sum: "$quantity" },
          },
        },
      ]),
      InventoryItem.find({ tenantId }).lean(),
    ]);

    const stockMap = new Map<string, number>();
    for (const item of stockAgg) {
      stockMap.set(String(item._id), item.quantity);
    }

    const invItemByCode = new Map<string, any>();
    const invItemById = new Map<string, any>();
    for (const it of existingInvItems) {
      if (it.itemCode) invItemByCode.set(it.itemCode, it);
      invItemById.set(String(it._id), it);
    }

    const allAlertItems: any[] = [];
    const seenCodes = new Set<string>();

    for (const prod of trackedProducts) {
      const code = prod.tab_general_information?.default_code || String(prod._id);
      seenCodes.add(code);
      seenCodes.add(String(prod._id));

      const matchingInv = invItemByCode.get(code) || invItemById.get(String(prod._id));
      const onHand = stockMap.get(String(prod._id)) ?? (matchingInv ? matchingInv.quantity : 0);
      const reorderLevel = matchingInv?.reorderLevel ?? 10;
      const reorderQuantity = matchingInv?.reorderQuantity ?? 20;
      const unitCost = prod.tab_general_information?.standard_price ?? (matchingInv?.unitCost ?? 0);
      const unit = prod.tab_general_information?.unit || matchingInv?.unit || "Units";
      const wh = matchingInv?.warehouse || "Main Warehouse";
      const category = matchingInv?.category || "General";

      if (onHand <= reorderLevel) {
        allAlertItems.push({
          _id: matchingInv?._id || prod._id,
          itemCode: code,
          name: prod.header?.name || matchingInv?.name || "Stock Item",
          category,
          quantity: onHand,
          reorderLevel,
          reorderQuantity,
          unitCost,
          totalValue: onHand * unitCost,
          warehouse: wh,
          unit,
          status: onHand <= 0 ? "out_of_stock" : (onHand <= reorderLevel * 0.5 ? "critical" : "low_stock"),
          createdAt: matchingInv?.createdAt || prod.createdAt || new Date(),
          updatedAt: matchingInv?.updatedAt || prod.updatedAt || new Date(),
        });
      }
    }

    // Include any standalone InventoryItem not mapped to a Product
    for (const it of existingInvItems) {
      if (!seenCodes.has(it.itemCode) && !seenCodes.has(String(it._id))) {
        if (it.quantity <= it.reorderLevel) {
          allAlertItems.push({
            ...it,
            status: it.quantity <= 0 ? "out_of_stock" : (it.quantity <= it.reorderLevel * 0.5 ? "critical" : "low_stock"),
          });
        }
      }
    }

    const warehouses = Array.from(new Set(allAlertItems.map((a) => a.warehouse).filter(Boolean)));

    // KPIs computed from tenant-wide unfiltered alerts
    const kpis = {
      total: allAlertItems.length,
      outOfStock: allAlertItems.filter((a) => a.quantity <= 0).length,
      critical: allAlertItems.filter((a) => a.quantity > 0 && a.quantity <= (a.reorderLevel ?? 10) * 0.5).length,
      totalValuation: allAlertItems.reduce((acc, a) => acc + (a.reorderQuantity || 0) * (a.unitCost || 0), 0),
    };

    let filtered = allAlertItems;
    if (warehouse && warehouse !== "all") {
      filtered = filtered.filter((a) => a.warehouse === warehouse);
    }
    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((a) => a.status === statusFilter);
    }
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filtered = filtered.filter((a) => re.test(a.name) || re.test(a.itemCode) || re.test(a.category));
    }

    // Sort by quantity ascending (lowest stock first)
    filtered.sort((a, b) => a.quantity - b.quantity);

    const pageParam = searchParams.get('page');
    if (!pageParam) {
      const payload = { alerts: filtered, total: filtered.length, page: 1, totalPages: 1, kpis, warehouses };
      setCachedData(cacheKey, payload, 20_000);
      return NextResponse.json(payload);
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '10')));
    const skip = (page - 1) * limit;
    const pagedAlerts = filtered.slice(skip, skip + limit);

    const payload = {
      alerts: pagedAlerts,
      total: filtered.length,
      page,
      totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
      kpis,
      warehouses,
    };

    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

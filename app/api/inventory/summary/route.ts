import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import StockTransfer from "@/models/inventory/StockTransfer";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET() {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user?.role !== "inventory" && session.user?.role !== "admin")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const cacheKey = `inventory_summary:${tenantId}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();

    // Run independent product, operations, and stock reads concurrently so
    // summary latency is bounded by the slowest query rather than their sum.
    const [trackedProducts, receiptsToProcess, deliveriesToProcess, manufacturingToProcess, stockAgg] =
      await Promise.all([
        Product.find({
          tenantId,
          "tab_general_information.type": { $ne: "service" },
          status: { $ne: "archived" },
        })
          .select("_id header.name tab_general_information.default_code tab_general_information.standard_price")
          .lean(),

        StockTransfer.countDocuments({
          tenantId,
          "header.operationType": "incoming",
          status: { $nin: [DOCUMENT_STATUS.CLOSED, DOCUMENT_STATUS.CANCELLED] },
        }),

        StockTransfer.countDocuments({
          tenantId,
          "header.operationType": "outgoing",
          status: { $nin: [DOCUMENT_STATUS.CLOSED, DOCUMENT_STATUS.CANCELLED] },
        }),

        ManufacturingOrder.countDocuments({
          tenantId,
          status: { $nin: [DOCUMENT_STATUS.CLOSED, DOCUMENT_STATUS.CANCELLED] },
        }),

        Stock.aggregate([
          { $match: { tenantId } },
          {
            $group: {
              _id: "$product",
              quantity: { $sum: "$quantity" },
            },
          },
        ]),
      ]);

    const stockMap = new Map<string, number>();
    for (const item of stockAgg) {
      stockMap.set(String(item._id), item.quantity);
    }

    let totalValue = 0;
    const totalTracked = trackedProducts.length;
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const prod of trackedProducts) {
      const onHand = stockMap.get(String(prod._id)) ?? 0;
      const unitCost = prod.tab_general_information?.standard_price || 0;

      if (onHand > 0) {
        inStockCount++;
        totalValue += onHand * unitCost;
        if (onHand <= 5) {
          lowStockCount++;
        }
      } else {
        outOfStockCount++;
        lowStockCount++; // 0 quantity requires replenishment
      }
    }

    const inStockRate = totalTracked > 0 ? Math.round((inStockCount / totalTracked) * 100) : 0;

    const summary = {
      totalItems: {
        current: totalTracked,
        change: 0,
      },
      totalValue: {
        current: totalValue,
        change: 0,
      },
      lowStock: {
        current: lowStockCount,
        change: 0,
      },
      outOfStock: {
        current: outOfStockCount,
        change: 0,
      },
      inStockRate,
      operations: {
        receipts: receiptsToProcess,
        deliveries: deliveriesToProcess,
        manufacturing: manufacturingToProcess,
      },
    };

    const responsePayload = { summary };
    setCachedData(cacheKey, responsePayload, 20_000);
    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("Error fetching inventory summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Product from "@/models/Product";
import Stock from "@/models/Stock";
import StockTransfer from "@/models/StockTransfer";
import ManufacturingOrder from "@/models/ManufacturingOrder";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function GET() {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user?.role !== "inventory" && session.user?.role !== "admin")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    // 1. Total Items (Products)
    const currentItems = await Product.countDocuments({
      tenantId,
    });

    // 2. Total Value (Stock * Cost)
    const valueAgg = await Stock.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: "$product",
          quantity: { $sum: "$quantity" },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      { $unwind: "$productDoc" },
      {
        $project: {
          value: {
            $multiply: [
              "$quantity",
              {
                $ifNull: [
                  "$productDoc.tab_general_information.standard_price",
                  0,
                ],
              },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalValue: { $sum: "$value" },
        },
      },
    ]);
    const totalValue = valueAgg[0]?.totalValue || 0;

    // 3. Operational Counts
    const receiptsToProcess = await StockTransfer.countDocuments({
      "header.operationType": "incoming",
      status: { $ne: DOCUMENT_STATUS.CLOSED },
    });

    const deliveriesToProcess = await StockTransfer.countDocuments({
      "header.operationType": "outgoing",
      status: { $ne: DOCUMENT_STATUS.CLOSED },
    });

    const manufacturingToProcess = await ManufacturingOrder.countDocuments({
       
      status: { $ne: DOCUMENT_STATUS.CLOSED },
    });

    // 4. Low Stock (Items with quantity <= 5)
    // We need to aggregate stock first.
    // Re-use aggregation or simpler check?
    // Aggregate all products quantities. Count those <= 5.
    const lowStockAgg = await Stock.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: "$product",
          quantity: { $sum: "$quantity" },
        },
      },
      { $match: { quantity: { $lte: 5 } } },
      { $count: "count" },
    ]);
    const lowStockCount = lowStockAgg[0]?.count || 0;

    const summary = {
      totalItems: {
        current: currentItems,
        change: 0, // No history tracking yet
      },
      totalValue: {
        current: totalValue,
        change: 0,
      },
      lowStock: {
        current: lowStockCount,
        change: 0,
      },
      operations: {
        receipts: receiptsToProcess,
        deliveries: deliveriesToProcess,
        manufacturing: manufacturingToProcess,
      },
    };

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error fetching inventory summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch summary" },
      { status: 500 },
    );
  }
}

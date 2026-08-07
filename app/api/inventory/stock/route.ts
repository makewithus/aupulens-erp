import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Stock from "@/models/Stock";
import Product from "@/models/Product"; // Ensure Product model is registered
import { checkNegativeStockGuard } from "@/lib/inventory/stockGuard";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    // Aggregate stock by product
    const stockLevels = await Stock.aggregate([
      { $match: { tenantId } },
      {
        $group: {
          _id: "$product",
          totalQuantity: { $sum: "$quantity" },
        },
      },
    ]);

    // Convert array to map for easy frontend lookup
    // { "prodId": 50, ... }
    const stockMap: Record<string, number> = {};
    stockLevels.forEach((item) => {
      stockMap[item._id.toString()] = item.totalQuantity;
    });

    return NextResponse.json({ stock: stockMap });
  } catch (error) {
    console.error("Error fetching stock levels:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { productId, quantity, reference, notes, type } = body;

    if (!productId || quantity === undefined) {
      return NextResponse.json(
        { error: "Product and Quantity are required" },
        { status: 400 },
      );
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    const guard = await checkNegativeStockGuard(tenantId, productId, Number(quantity));
    if (guard.ok === false) {
      return NextResponse.json({ error: guard.message }, { status: 400 });
    }

    const stockEntry = await Stock.create({
      product: productId,
      quantity, // Can be positive or negative
      type: type || "adjustment",
      reference: reference || "Manual Adjustment",
      notes,
      tenantId,
      createdBy: session.user.id,
    });

    return NextResponse.json(stockEntry, { status: 201 });
  } catch (error: any) {
    console.error("Error creating stock entry:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Stock from "@/models/Stock";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const productIdsParam = searchParams.get("productIds");

    if (!productIdsParam) {
      return NextResponse.json(
        { error: "productIds required" },
        { status: 400 },
      );
    }

    const productIds = productIdsParam.split(",").filter(Boolean);
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    await connectDB();

    // Calculate stock levels for each product — one batched query for every
    // product instead of a per-product round trip, then group in memory.
    const levels: Record<string, number> = {};
    for (const productId of productIds) levels[productId] = 0;

    const stockMovements = await Stock.find({
      product: { $in: productIds },
      isReserved: { $ne: true }, // Exclude reserved stock
    }).lean();

    for (const movement of stockMovements) {
      const productId = String(movement.product);
      if (!(productId in levels)) continue;
      if (movement.type === "in" || movement.type === "adjustment") {
        levels[productId] += movement.quantity;
      } else if (movement.type === "out") {
        levels[productId] -= movement.quantity;
      }
    }

    return NextResponse.json({ levels });
  } catch (error: any) {
    console.error("Stock levels error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

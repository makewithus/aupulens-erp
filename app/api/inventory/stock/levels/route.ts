import { NextRequest, NextResponse } from "next/server";
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
    const tenantId = session.user.tenantId || "default-tenant";

    await connectDB();

    // Calculate stock levels for each product
    const levels: Record<string, number> = {};

    for (const productId of productIds) {
      // Get all stock movements for this product (excluding reservations)
      const stockMovements = await Stock.find({
        product: productId,
         
        isReserved: { $ne: true }, // Exclude reserved stock
      }).lean();

      // Calculate net stock: sum of 'in' minus sum of 'out'
      let totalIn = 0;
      let totalOut = 0;

      for (const movement of stockMovements) {
        if (movement.type === "in" || movement.type === "adjustment") {
          totalIn += movement.quantity;
        } else if (movement.type === "out") {
          totalOut += movement.quantity;
        }
      }

      levels[productId] = totalIn - totalOut;
    }

    return NextResponse.json({ levels });
  } catch (error: any) {
    console.error("Stock levels error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

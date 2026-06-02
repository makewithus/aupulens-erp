import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StockMove from "@/models/StockMove";
import Warehouse from "@/models/Warehouse";
import Product from "@/models/Product";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = session.user.tenantId || "default-tenant";
    const searchParams = req.nextUrl.searchParams;
    const moveStatus = searchParams.get("moveStatus");
    const moveType = searchParams.get("moveType");

    await connectDB();

    const query: any = { tenantId };
    if (moveStatus) {
      query.moveStatus = { $in: moveStatus.split(",") };
    }
    if (moveType) {
      query.moveType = moveType;
    }

    const moves = await StockMove.find(query)
      .populate("sourceLocation.warehouseId", "name warehouseCode")
      .populate("destinationLocation.warehouseId", "name warehouseCode")
      .populate("lines.productId", "header.name")
      .populate("responsibleId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ items: moves });
  } catch (error: any) {
    console.error("Error fetching stock moves:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantId = session.user.tenantId || "default-tenant";
    const body = await req.json();

    await connectDB();

    // Auto-generate reference if not provided
    if (!body.reference) {
      const prefixMap: Record<string, string> = {
        internal: "INT",
        incoming: "IN",
        outgoing: "OUT",
        adjustment: "ADJ",
      };
      const prefix = prefixMap[body.moveType] || "SM";
      const count = await StockMove.countDocuments({ tenantId });
      body.reference = `${prefix}/${new Date().getFullYear()}/${String(count + 1).padStart(5, "0")}`;
    }

    // Calculate line values
    if (body.lines && Array.isArray(body.lines)) {
      body.lines = body.lines.map((line: any) => ({
        ...line,
        totalValue: (line.demand || 0) * (line.unitCost || 0),
      }));

      // Calculate total valuation
      body.valuation = {
        method: body.valuation?.method || "standard",
        totalValue: body.lines.reduce(
          (sum: number, l: any) => sum + (l.totalValue || 0),
          0,
        ),
      };
    }

    const move = await StockMove.create({
      ...body,
      tenantId,
      responsibleId: body.responsibleId || session.user.id,
      chatter: [
        {
          authorId: session.user.id,
          body: `Stock move ${body.moveType} requested`,
          type: "notification",
        },
      ],
    });

    return NextResponse.json({ item: move }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating stock move:", error);
    if (error.code === 11000) {
      return NextResponse.json(
        { error: "Move reference already exists" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

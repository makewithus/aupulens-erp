import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ItemBOM from "@/models/ItemBOM";
import Item from "@/models/Item";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const query_str = searchParams.get("query") || "";

  const filter: any = { tenantId: session.user.tenantId };
  if (query_str) {
    filter.$or = [
      { name: { $regex: query_str, $options: "i" } },
      { bomNumber: { $regex: query_str, $options: "i" } },
    ];
  }

  const boms = await ItemBOM.find(filter)
    .populate("itemToProduceId", "name unit type")
    .populate("components.itemId", "name unit")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: boms });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ success: false, message: "BOM name is required" }, { status: 400 });
    }
    if (!body.itemToProduceId) {
      return NextResponse.json({ success: false, message: "Item to produce is required" }, { status: 400 });
    }

    // Auto-generate bomNumber if not provided
    if (!body.bomNumber) {
      const count = await ItemBOM.countDocuments({ tenantId: session.user.tenantId });
      body.bomNumber = `BOM-${String(count + 1).padStart(5, "0")}`;
    }

    const bom = await ItemBOM.create({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: bom }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A BOM with this number already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ItemBOM from "@/models/manufacturing/ItemBOM";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId)
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await connectDB();
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query")?.trim() || "";

    const filter: any = { tenantId: session.user.tenantId };
    if (query) {
      // Escape user input so punctuation is treated literally, not as regex syntax.
      const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escapedQuery, $options: "i" } },
        { bomNumber: { $regex: escapedQuery, $options: "i" } },
      ];
    }

    const baseQuery = ItemBOM.find(filter)
      .populate("itemToProduceId", "name unit type")
      .populate("components.itemId", "name unit")
      .sort({ createdAt: -1 });

    const pageParam = searchParams.get("page");
    if (!pageParam) {
      const boms = await baseQuery.lean();
      return NextResponse.json({ success: true, data: boms, total: boms.length, page: 1, totalPages: 1 });
    }

    const requestedPage = Number.parseInt(pageParam, 10);
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "10", 10);
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 10;
    const skip = (page - 1) * limit;

    const [total, boms] = await Promise.all([
      ItemBOM.countDocuments(filter),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ success: true, data: boms, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error("[manufacturing/item-bom] Failed to load BOMs:", error);
    return NextResponse.json({ success: false, message: safeInternalErrorMessage() }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = stripProtectedFields(await req.json());

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
    return NextResponse.json({ success: false, message: safeInternalErrorMessage() }, { status: 500 });
  }
}

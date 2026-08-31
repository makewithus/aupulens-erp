import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Item from "@/models/manufacturing/Item";

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
      { sku: { $regex: query_str, $options: "i" } },
      { category: { $regex: query_str, $options: "i" } },
    ];
  }

  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  if (dateFrom || dateTo) {
    const range: any = {};
    if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
    if (dateTo && !isNaN(Date.parse(dateTo))) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    if (Object.keys(range).length > 0) filter.createdAt = range;
  }

  const baseQuery = Item.find(filter)
    .populate("salesInfo.accountId", "code name")
    .populate("purchaseInfo.accountId", "code name")
    .populate("purchaseInfo.preferredVendorId", "name")
    .populate("inventoryTracking.inventoryAccountId", "code name")
    .populate("inventoryTracking.grniAccountId", "code name")
    .sort({ createdAt: -1 });

  // Pagination is opt-in via `page` — this same list backs the BOM
  // component picker on this page, which needs every item, not just the
  // first page, so omitting `page` must keep returning everything.
  const pageParam = searchParams.get("page");
  if (!pageParam) {
    const items = await baseQuery.lean();
    return NextResponse.json({
      success: true,
      data: { items, total: items.length, page: 1, totalPages: 1 },
    });
  }

  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    baseQuery.skip(skip).limit(limit).lean(),
    Item.countDocuments(filter),
  ]);

  return NextResponse.json({
    success: true,
    data: { items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ success: false, message: "Item name is required" }, { status: 400 });
    }
    if (!body.unit) {
      return NextResponse.json({ success: false, message: "Unit is required" }, { status: 400 });
    }

    const item = await Item.create({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "An item with this SKU already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

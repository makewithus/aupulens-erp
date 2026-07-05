import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SalesView from "@/models/SalesView";
import { SYSTEM_VIEW_DEFINITIONS } from "@/lib/sales/saleOrderViews";

const ENTITY_TYPE = "sales-orders";

async function ensureSystemViews(tenantId: string) {
  const existing = await SalesView.countDocuments({ tenantId, entityType: ENTITY_TYPE, isSystem: true });
  if (existing > 0) return;
  await SalesView.insertMany(
    SYSTEM_VIEW_DEFINITIONS.map((v) => ({
      tenantId,
      entityType: ENTITY_TYPE,
      name: v.name,
      criteria: v.criteria || [],
      specialFilter: v.specialFilter,
      columns: [],
      isSystem: true,
    })),
  );
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    await ensureSystemViews(tenantId);

    const views = await SalesView.find({ tenantId, entityType: ENTITY_TYPE })
      .sort({ isSystem: -1, createdAt: 1 })
      .lean();

    return NextResponse.json({ success: true, data: views });
  } catch (error: any) {
    console.error("Sale order views GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, message: "View name is required" }, { status: 400 });
    }

    const view = await SalesView.create({
      tenantId,
      entityType: ENTITY_TYPE,
      name: body.name.trim(),
      criteria: body.criteria || [],
      columns: body.columns || [],
      visibility: body.visibility,
      isFavorite: !!body.isFavorite,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: view }, { status: 201 });
  } catch (error: any) {
    console.error("Sale order views POST error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

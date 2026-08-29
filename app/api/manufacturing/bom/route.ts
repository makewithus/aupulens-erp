import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BillOfMaterial from "@/models/manufacturing/BillOfMaterial";
import Product from "@/models/inventory/Product"; // Ensure Product model is registered

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    await connectDB();

    const boms = await BillOfMaterial.find({ tenantId })
      .populate(
        "header.productId",
        "header.name tab_general_information.default_code",
      )
      .populate("chatter.authorId", "name image")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ boms });
  } catch (error: any) {
    console.error("Fetch BoMs Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const body = await req.json();

    await connectDB();

    // Create BoM
    const bom = await BillOfMaterial.create({
      ...body,
      tenantId,
      chatter: [
        {
          authorId: session.user.id,
          body: "Created Bill of Material",
          type: "notification",
        },
      ],
    });

    return NextResponse.json({ bom }, { status: 201 });
  } catch (error: any) {
    console.error("Create BoM Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

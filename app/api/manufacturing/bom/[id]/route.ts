import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BillOfMaterial from "@/models/manufacturing/BillOfMaterial";
import Product from "@/models/inventory/Product"; // Ensure registration

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const bom = await BillOfMaterial.findOne({ _id: id, tenantId })
      .populate(
        "header.productId",
        "header.name tab_general_information.default_code",
      )
      .populate(
        "components_tab.productId",
        "header.name tab_general_information.default_code",
      )
      .populate("chatter.authorId", "name image")
      .lean();

    if (!bom) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ bom });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

    // Process chatter: handle populated authorId objects and set authorId for new messages
    if (body.chatter && Array.isArray(body.chatter)) {
      body.chatter = body.chatter.map((msg: any) => {
        let authorId = msg.authorId;
        if (authorId && typeof authorId === "object" && authorId._id) {
          authorId = authorId._id;
        } else if (!authorId) {
          authorId = session.user.id as any;
        }

        return {
          body: msg.body,
          type: msg.type,
          createdAt: msg.createdAt,
          authorId,
        };
      });
    }

    const updated = await BillOfMaterial.findOneAndUpdate(
      { _id: id, tenantId },
      { ...body, tenantId },
      { new: true },
    )
      .populate("header.productId", "header.name")
      .populate("components_tab.productId", "header.name")
      .populate("chatter.authorId", "name image");

    if (!updated)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ bom: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();
    const deleted = await BillOfMaterial.findOneAndDelete({ _id: id, tenantId });
    if (!deleted)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

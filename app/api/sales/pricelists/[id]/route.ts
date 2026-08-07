import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Pricelist from "@/models/Pricelist";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const item = await Pricelist.findOne({
      _id: id,
      tenantId,
    }).lean();

    if (!item) {
      return NextResponse.json(
        { error: "Pricelist not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error fetching pricelist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json();

    const item = await Pricelist.findOneAndUpdate(
      { _id: id, tenantId },
      body,
      { new: true },
    );

    if (!item) {
      return NextResponse.json(
        { error: "Pricelist not found or unauthorized" },
        { status: 404 },
      );
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error updating pricelist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const item = await Pricelist.findOneAndDelete({
      _id: id,
      tenantId,
    });

    if (!item) {
      return NextResponse.json(
        { error: "Pricelist not found or unauthorized" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Pricelist deleted" });
  } catch (error) {
    console.error("Error deleting pricelist:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

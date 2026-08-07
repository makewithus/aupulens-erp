import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DeliveryChallan from "@/models/DeliveryChallan";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;
    await connectDB();
    const challan = await DeliveryChallan.findOne({ _id: id, tenantId }).lean();

    if (!challan) {
      return NextResponse.json(
        { error: "Delivery Challan not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(challan);
  } catch (error) {
    console.error("Error fetching delivery challan:", error);
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
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;
    await connectDB();

    const challan = await DeliveryChallan.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true, runValidators: true },
    );

    if (!challan) {
      return NextResponse.json(
        { error: "Delivery Challan not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(challan);
  } catch (error) {
    console.error("Error updating delivery challan:", error);
    if ((error as any).code === 11000) {
      return NextResponse.json(
        { error: "DC number already exists" },
        { status: 409 },
      );
    }
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
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;
    await connectDB();
    const challan = await DeliveryChallan.findOneAndDelete({ _id: id, tenantId });

    if (!challan) {
      return NextResponse.json(
        { error: "Delivery Challan not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Delivery Challan deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting delivery challan:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

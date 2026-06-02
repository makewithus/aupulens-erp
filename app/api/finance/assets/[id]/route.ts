import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Asset from "@/models/Asset";
import { logActivity } from "@/lib/logger";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const body = await req.json();
    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";

    const asset = await Asset.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    );

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    await logActivity({
      activity: `Updated asset: ${asset.name}`,
      details: `Asset ID: ${asset._id}`,
      req,
    });

    return NextResponse.json({ asset });
  } catch (error) {
    console.error("Error updating asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { id } = await params;
    const tenantId = (session.user as any).tenantId || "default-tenant";

    const asset = await Asset.findOneAndDelete({ _id: id, tenantId });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    await logActivity({
      activity: `Deleted asset: ${asset.name}`,
      details: `Asset ID: ${asset._id}`,
      req,
    });

    return NextResponse.json({ message: "Asset deleted" });
  } catch (error) {
    console.error("Error deleting asset:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

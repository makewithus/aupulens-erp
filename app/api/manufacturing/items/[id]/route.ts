import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Item from "@/models/Item";
import mongoose from "mongoose";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });

  await connectDB();
  const item = await Item.findOne({ _id: id, tenantId: session.user.tenantId })
    .populate("salesInfo.accountId", "code name")
    .populate("purchaseInfo.accountId", "code name")
    .populate("purchaseInfo.preferredVendorId", "name")
    .populate("inventoryTracking.inventoryAccountId", "code name")
    .populate("inventoryTracking.grniAccountId", "code name")
    .lean();

  if (!item)
    return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: item });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });

  await connectDB();
  try {
    const body = await req.json();
    const updated = await Item.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: body },
      { new: true }
    ).lean();

    if (!updated)
      return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });

  await connectDB();
  const deleted = await Item.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
  if (!deleted)
    return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });

  return NextResponse.json({ success: true, message: "Item deleted" });
}

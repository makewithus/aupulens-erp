import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ItemBOM from "@/models/manufacturing/ItemBOM";
import Item from "@/models/manufacturing/Item";
import mongoose from "mongoose";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });

  await connectDB();
  const bom = await ItemBOM.findOne({ _id: id, tenantId: session.user.tenantId })
    .populate("itemToProduceId", "name unit type")
    .populate("components.itemId", "name unit")
    .lean();

  if (!bom)
    return NextResponse.json({ success: false, message: "BOM not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: bom });
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
    const updated = await ItemBOM.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: body },
      { new: true }
    )
      .populate("itemToProduceId", "name unit type")
      .populate("components.itemId", "name unit")
      .lean();

    if (!updated)
      return NextResponse.json({ success: false, message: "BOM not found" }, { status: 404 });

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
  const deleted = await ItemBOM.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
  if (!deleted)
    return NextResponse.json({ success: false, message: "BOM not found" }, { status: 404 });

  return NextResponse.json({ success: true, message: "BOM deleted" });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Coupon from "@/models/manufacturing/Coupon";
import mongoose from "mongoose";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id))
    return NextResponse.json({ success: false, message: "Invalid ID" }, { status: 400 });

  await connectDB();
  const coupon = await Coupon.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!coupon)
    return NextResponse.json({ success: false, message: "Coupon not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: coupon });
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
    const updated = await Coupon.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: body },
      { new: true }
    ).lean();

    if (!updated)
      return NextResponse.json({ success: false, message: "Coupon not found" }, { status: 404 });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A coupon with this code already exists" }, { status: 409 });
    }
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
  const deleted = await Coupon.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
  if (!deleted)
    return NextResponse.json({ success: false, message: "Coupon not found" }, { status: 404 });

  return NextResponse.json({ success: true, message: "Coupon deleted" });
}

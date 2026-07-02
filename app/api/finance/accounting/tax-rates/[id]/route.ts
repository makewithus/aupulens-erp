import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import TaxRate from "@/models/TaxRate";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await connectDB();
  try {
    const body = await req.json();
    delete body.tenantId;
    delete body.createdBy;
    const doc = await TaxRate.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: body },
      { new: true, runValidators: true },
    );
    if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: doc });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A rate with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await connectDB();
  const doc = await TaxRate.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
  if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: { _id: id } });
}

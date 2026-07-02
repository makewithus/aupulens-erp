import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import BankingRule from "@/models/BankingRule";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.isValidObjectId(id))
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await connectDB();
  const rule = await BankingRule.findOne({ _id: id, tenantId: session.user.tenantId })
    .populate("accountId", "accountName accountCode")
    .populate("associatedAccountIds", "accountName accountCode")
    .lean();

  if (!rule) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: rule });
}

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

    const doc = await BankingRule.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId },
      { $set: body },
      { new: true, runValidators: true },
    );
    if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: doc });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: "A rule with this name already exists" },
        { status: 409 },
      );
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
  const doc = await BankingRule.findOneAndDelete({ _id: id, tenantId: session.user.tenantId });
  if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: { _id: id } });
}

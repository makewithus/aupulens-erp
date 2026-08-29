import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Budget from "@/models/finance/Budget";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const budgets = await Budget.find({ tenantId: session.user.tenantId })
    .populate("lines.accountId", "accountName accountCode")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: budgets });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();

    if (!body.name || !body.fiscalYear) {
      return NextResponse.json(
        { success: false, message: "Name and Fiscal Year are required" },
        { status: 400 },
      );
    }

    const doc = await Budget.create({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json(
        { success: false, message: "A budget with this name already exists for this fiscal year" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

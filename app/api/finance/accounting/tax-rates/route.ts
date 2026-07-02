import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import TaxRate from "@/models/TaxRate";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const query: any = { tenantId: session.user.tenantId };
  if (type) query.type = type;

  const rates = await TaxRate.find(query).populate("accountId", "accountName accountCode").sort({ name: 1 }).lean();
  return NextResponse.json({ success: true, data: rates });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    if (!body.name || body.ratePercent === undefined) {
      return NextResponse.json({ success: false, message: "Name and rate are required" }, { status: 400 });
    }
    const doc = await TaxRate.create({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A rate with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

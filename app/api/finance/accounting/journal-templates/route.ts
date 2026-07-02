import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import JournalTemplate from "@/models/JournalTemplate";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const templates = await JournalTemplate.find({ tenantId: session.user.tenantId })
    .populate("lines.accountId", "accountName accountCode")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: templates });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    if (!body.templateName || !body.notes) {
      return NextResponse.json({ success: false, message: "Template Name and Notes are required" }, { status: 400 });
    }

    const doc = await JournalTemplate.create({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A template with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

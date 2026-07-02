import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import CustomField from "@/models/CustomField";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  const { searchParams } = new URL(req.url);
  const appliesTo = searchParams.get("appliesTo");

  const query: any = { tenantId: session.user.tenantId };
  if (appliesTo) query.appliesTo = appliesTo;

  const fields = await CustomField.find(query).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ success: true, data: fields });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  await connectDB();
  try {
    const body = await req.json();
    if (!body.label || !body.appliesTo) {
      return NextResponse.json({ success: false, message: "Label and Applies To are required" }, { status: 400 });
    }
    const doc = await CustomField.create({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A field with this label already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

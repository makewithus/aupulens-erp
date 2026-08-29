import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import CustomField from "@/models/shared/CustomField";
import { CUSTOM_FIELD_APPLIES_TO } from "@/lib/constants/statuses";

// Thin proxy onto the shared CustomField model, mirroring
// app/api/sales/custom-fields/route.ts's pattern but scoped to
// appliesTo="customer" for the New/Edit Customer form's Custom Fields tab.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const fields = await CustomField.find({ tenantId: session.user.tenantId, appliesTo: CUSTOM_FIELD_APPLIES_TO.CUSTOMER })
      .sort({ createdAt: 1 })
      .lean();
    return NextResponse.json({ success: true, data: fields });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const body = await request.json();
    if (!body.label?.trim()) {
      return NextResponse.json({ success: false, message: "Label is required" }, { status: 400 });
    }

    const doc = await CustomField.create({
      label: body.label.trim(),
      fieldType: body.fieldType || undefined,
      options: body.options || [],
      required: !!body.required,
      appliesTo: CUSTOM_FIELD_APPLIES_TO.CUSTOMER,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
    });
    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, message: "A custom field with that label already exists" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

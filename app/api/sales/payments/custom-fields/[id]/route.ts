import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import CustomField from "@/models/shared/CustomField";
import { CUSTOM_FIELD_APPLIES_TO } from "@/lib/constants/statuses";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const field = await CustomField.findOneAndUpdate(
      { _id: id, tenantId: session.user.tenantId, appliesTo: CUSTOM_FIELD_APPLIES_TO.PAYMENT },
      { $set: body },
      { new: true },
    );
    if (!field) {
      return NextResponse.json({ success: false, message: "Field not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: field });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;

    const field = await CustomField.findOneAndDelete({
      _id: id,
      tenantId: session.user.tenantId,
      appliesTo: CUSTOM_FIELD_APPLIES_TO.PAYMENT,
    });
    if (!field) {
      return NextResponse.json({ success: false, message: "Field not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

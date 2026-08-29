import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import DocumentPrefix from "@/models/sales/DocumentPrefix";
import { clearOtherDefaults, promoteFallbackDefault } from "@/lib/sales/documentPrefixes";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;
    const body = await request.json();

    const row = await DocumentPrefix.findOne({ _id: id, tenantId });
    if (!row) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    if (body.isDefault === true) {
      await clearOtherDefaults(tenantId, row.documentType, row.kind, id);
    }

    if (typeof body.value === "string" && body.value.trim()) row.value = body.value.trim();
    if (typeof body.isDefault === "boolean") row.isDefault = body.isDefault;
    await row.save();

    return NextResponse.json({ success: true, data: row });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json({ success: false, message: "That prefix/suffix value already exists for this document type" }, { status: 409 });
    }
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
    const tenantId = session.user.tenantId;
    const { id } = await params;
    const row = await DocumentPrefix.findOneAndDelete({ _id: id, tenantId });
    if (!row) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    if (row.isDefault) {
      await promoteFallbackDefault(tenantId, row.documentType, row.kind);
    }

    return NextResponse.json({ success: true, message: "Deleted" });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

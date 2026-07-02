import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import AccountType from "@/models/AccountType";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";
    const { id } = await params;
    const body = await request.json();

    const accountType = await AccountType.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true }
    );
    if (!accountType) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ accountType });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";
    const { id } = await params;

    const accountType = await AccountType.findOne({ _id: id, tenantId });
    if (!accountType) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (accountType.isSystem) return NextResponse.json({ error: "Cannot delete system account type" }, { status: 400 });

    await AccountType.deleteOne({ _id: id, tenantId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const { id } = await params;
    const body = await request.json();

    if (!body.accountCode) delete body.accountCode;

    const account = await Account.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true }
    );
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ account });
  } catch (error: any) {
    if (error.code === 11000) {
      return NextResponse.json({ error: "Account with this name or code already exists" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const { id } = await params;

    const account = await Account.findOne({ _id: id, tenantId });
    if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (account.isLocked) return NextResponse.json({ error: "Cannot delete locked account" }, { status: 400 });

    await Account.deleteOne({ _id: id, tenantId });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

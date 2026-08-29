import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import CustomsClearance from "@/models/manufacturing/CustomsClearance";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !["admin", "manufacturing", "master-admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;

    await connectDB();
    const clearance = await CustomsClearance.findOneAndDelete({ _id: id, tenantId });

    if (!clearance) {
      return NextResponse.json({ error: "Customs clearance not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Customs clearance deleted successfully" });
  } catch (error) {
    console.error("Error deleting customs clearance:", error);
    return NextResponse.json({ error: "Failed to delete customs clearance" }, { status: 500 });
  }
}

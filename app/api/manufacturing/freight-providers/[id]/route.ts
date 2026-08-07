import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import FreightProvider from "@/models/FreightProvider";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !["admin", "manufacturing"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;

    await connectDB();
    const provider = await FreightProvider.findOneAndDelete({ _id: id, tenantId });

    if (!provider) {
      return NextResponse.json({ error: "Freight provider not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Freight provider deleted successfully" });
  } catch (error) {
    console.error("Error deleting freight provider:", error);
    return NextResponse.json({ error: "Failed to delete freight provider" }, { status: 500 });
  }
}

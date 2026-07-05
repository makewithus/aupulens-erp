import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import HSCode from "@/models/HSCode";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || !["admin", "manufacturing"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { id } = await params;

    await connectDB();
    const hsCode = await HSCode.findOneAndDelete({ _id: id, tenantId });

    if (!hsCode) {
      return NextResponse.json({ error: "HS Code not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "HS Code deleted successfully" });
  } catch (error) {
    console.error("Error deleting HS code:", error);
    return NextResponse.json({ error: "Failed to delete HS code" }, { status: 500 });
  }
}

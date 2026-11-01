import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import User from "@/models/auth/User";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || !["admin", "sales", "finance", "inventory", "hr", "master-admin"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;

    await connectDB();
    const user = await User.findOne({
      _id: session.user.id,
      tenantId: (session.user as any).tenantId,
    }).select("-password").lean();

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

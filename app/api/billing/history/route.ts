import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import { requireOrgAdmin } from "@/lib/org/rbac";

export async function GET(_req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Admin-only — reuses lib/org/rbac.ts, same as Step 3 invite route.
    try {
      requireOrgAdmin(session);
    } catch {
      return NextResponse.json(
        { success: false, message: "Forbidden: admin role required to view billing history" },
        { status: 403 }
      );
    }

    await connectDB();

    const events = await SubscriptionEvent.find({ tenantId })
      .sort({ occurredAt: -1 })
      .lean();

    return NextResponse.json({ success: true, data: events });
  } catch (error: unknown) {
    console.error("Billing history error:", error);
    return NextResponse.json(
      { success: false, message: (error as Error).message || "Something went wrong" },
      { status: 500 }
    );
  }
}

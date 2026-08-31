import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SubscriptionEvent from "@/models/admin/SubscriptionEvent";
import { requireOrgAdmin } from "@/lib/org/rbac";

export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const query: any = { tenantId };
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query.occurredAt = range;
    }

    const events = await SubscriptionEvent.find(query)
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

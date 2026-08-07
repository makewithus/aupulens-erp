import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Counter from "@/models/Counter";

const PREFIX = "ORD-";

// Read-only peek at the next order number (doesn't consume the counter) so
// the "New Order" form can show a real number instead of a blank required
// field the user has to make up themselves (Issue #9).
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user?.role !== "inventory" && session.user?.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const counter = await Counter.findOne({ tenantId, key: `inventoryOrder:${PREFIX}` }).lean();
    const nextSeq = ((counter as any)?.seq || 0) + 1;

    return NextResponse.json({ number: `${PREFIX}${String(nextSeq).padStart(4, "0")}` });
  } catch (error) {
    console.error("Error computing next order number:", error);
    return NextResponse.json({ error: "Failed to compute next order number" }, { status: 500 });
  }
}

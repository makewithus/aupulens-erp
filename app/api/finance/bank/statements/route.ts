import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import BankStatement from "@/models/finance/BankStatement";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const ALLOWED_ROLES = ["finance", "admin", "master-admin"];
    if (!ALLOWED_ROLES.includes(session.user?.role)) {
      return NextResponse.json({ error: "Forbidden: Access denied" }, { status: 403 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    await dbConnect();

    const query: any = { tenantId };
    if (status) query.status = status;

    const items = await BankStatement.find(query)
          .sort({ createdAt: -1 })
          .populate("header.journalId").lean();

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Fetch bank statements error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

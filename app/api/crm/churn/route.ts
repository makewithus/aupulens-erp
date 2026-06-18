import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { scanTenantChurnRisk } from "@/lib/crm/churnRisk";
import { computeAndStoreChurnRisk } from "@/lib/crm/churnRisk";

// ─── GET /api/crm/churn?account_id=<id> ──────────────────────────────────────
// Single account churn risk OR tenant-wide churn summary
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");

  if (accountId) {
    const result = await computeAndStoreChurnRisk(
      accountId,
      session.user.tenantId,
      session.user.id
    );
    return NextResponse.json({ success: true, data: result });
  }

  // Full tenant scan
  const summary = await scanTenantChurnRisk(session.user.tenantId, session.user.id);
  return NextResponse.json({ success: true, data: summary });
}

// ─── POST /api/crm/churn — Force tenant-wide scan ─────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const summary = await scanTenantChurnRisk(session.user.tenantId, session.user.id);
  return NextResponse.json({ success: true, data: summary });
}

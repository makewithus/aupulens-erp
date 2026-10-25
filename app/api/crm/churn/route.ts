import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { scanTenantChurnRisk } from "@/lib/crm/churnRisk";
import { computeAndStoreChurnRisk } from "@/lib/crm/churnRisk";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

// ─── GET /api/crm/churn?account_id=<id> ──────────────────────────────────────
// Single account churn risk OR tenant-wide churn summary
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  const tenantId = session.user.tenantId;
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");

  if (accountId) {
    await dbConnect();
    const result = await computeAndStoreChurnRisk(
      accountId,
      tenantId,
      session.user.id
    );
    return NextResponse.json({ success: true, data: result });
  }

  const cacheKey = `crm-churn:${tenantId}`;
  const cached = getCachedData<any>(cacheKey);
  if (cached) return NextResponse.json(cached);

  await dbConnect();

  // Full tenant scan
  const summary = await scanTenantChurnRisk(tenantId, session.user.id);
  const responsePayload = { success: true, data: summary };
  setCachedData(cacheKey, responsePayload, 30_000);

  return NextResponse.json(responsePayload);
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

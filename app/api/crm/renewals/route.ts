import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { runRenewalEngine, getRenewalRiskSummary } from "@/lib/crm/renewalEngine";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/api/serverCache";

// ─── GET /api/crm/renewals — Risk summary ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  const tenantId = session.user.tenantId;
  const isFresh = req.nextUrl.searchParams.get("fresh") === "true";
  const cacheKey = `crm-renewals:${tenantId}`;

  if (!isFresh) {
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  await dbConnect();
  const summary = await getRenewalRiskSummary(tenantId);
  const payload = { success: true, data: summary };
  setCachedData(cacheKey, payload, 20_000);
  return NextResponse.json(payload);
}

// ─── POST /api/crm/renewals — Trigger engine run ──────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  const tenantId = session.user.tenantId;
  await dbConnect();
  const result = await runRenewalEngine(tenantId);
  invalidateCache(`crm-renewals:${tenantId}`);
  return NextResponse.json({ success: true, data: result });
}

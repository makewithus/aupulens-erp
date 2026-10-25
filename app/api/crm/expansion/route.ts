import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { computeExpansionForecast } from "@/lib/crm/expansionForecast";
import { runExpansionEngine, getExpansionSummary } from "@/lib/crm/expansionEngine";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/api/serverCache";

// ─── GET /api/crm/expansion?account_id=<id>&horizon=12 ───────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  const tenantId = session.user.tenantId;
  const isFresh = req.nextUrl.searchParams.get("fresh") === "true";
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  const horizon = parseInt(url.searchParams.get("horizon") || "12");

  const cacheKey = `crm-expansion:${tenantId}:${accountId || "all"}:${horizon}`;
  if (!isFresh) {
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  await dbConnect();

  if (accountId) {
    const [summary, forecast] = await Promise.all([
      getExpansionSummary(accountId, tenantId),
      computeExpansionForecast(tenantId, horizon),
    ]);
    const payload = { success: true, data: { summary, forecast } };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  }

  // Tenant-wide forecast
  const forecast = await computeExpansionForecast(tenantId, horizon);
  const payload = { success: true, data: forecast };
  setCachedData(cacheKey, payload, 20_000);
  return NextResponse.json(payload);
}

// ─── POST /api/crm/expansion — Run engine for account ────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json().catch(() => ({}));
  const accountId = body.account_id;
  if (!accountId) {
    return NextResponse.json(
      { success: false, message: "account_id required" },
      { status: 422 }
    );
  }

  const recommendations = await runExpansionEngine(
    accountId,
    session.user.tenantId,
    session.user.id
  );

  invalidateCache(`crm-expansion:${session.user.tenantId}`);
  return NextResponse.json({ success: true, data: recommendations });
}

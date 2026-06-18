import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { computeExpansionForecast } from "@/lib/crm/expansionForecast";
import { runExpansionEngine, getExpansionSummary } from "@/lib/crm/expansionEngine";

// ─── GET /api/crm/expansion?account_id=<id>&horizon=12 ───────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  const horizon = parseInt(url.searchParams.get("horizon") || "12");

  if (accountId) {
    const [summary, forecast] = await Promise.all([
      getExpansionSummary(accountId, session.user.tenantId),
      computeExpansionForecast(session.user.tenantId, horizon),
    ]);
    return NextResponse.json({ success: true, data: { summary, forecast } });
  }

  // Tenant-wide forecast
  const forecast = await computeExpansionForecast(session.user.tenantId, horizon);
  return NextResponse.json({ success: true, data: forecast });
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

  return NextResponse.json({ success: true, data: recommendations });
}

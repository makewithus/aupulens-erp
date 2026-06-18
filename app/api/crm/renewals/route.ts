import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { runRenewalEngine, getRenewalRiskSummary } from "@/lib/crm/renewalEngine";

// ─── GET /api/crm/renewals — Risk summary ─────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const summary = await getRenewalRiskSummary(session.user.tenantId);
  return NextResponse.json({ success: true, data: summary });
}

// ─── POST /api/crm/renewals — Trigger engine run ──────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const result = await runRenewalEngine(session.user.tenantId);
  return NextResponse.json({ success: true, data: result });
}

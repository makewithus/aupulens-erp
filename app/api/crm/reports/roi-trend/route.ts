import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { computeROITrend } from "@/lib/crm/campaignROITrend";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const days = Math.min(730, Math.max(30, Number(new URL(req.url).searchParams.get("days")) || 365));
  const data = await computeROITrend(session.user.tenantId, days);
  return NextResponse.json({ success: true, data });
}

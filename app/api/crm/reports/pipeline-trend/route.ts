import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { computePipelineTrend } from "@/lib/crm/pipelineEngine";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const months = Math.min(24, Math.max(3, Number(new URL(req.url).searchParams.get("months")) || 12));
  const data = await computePipelineTrend(session.user.tenantId, months);
  return NextResponse.json({ success: true, data });
}

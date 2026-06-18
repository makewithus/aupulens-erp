import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmAIInsight from "@/models/crm/AIInsight";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const status = url.searchParams.get("status") || "Active";

  const query: any = { tenantId: session.user.tenantId, status };
  if (entityType) query.entityType = entityType;
  if (entityId) query.entityId = entityId;

  const insights = await CrmAIInsight.find(query).sort({ severity: 1, confidence: -1 }).lean();

  return NextResponse.json({ success: true, data: insights });
}

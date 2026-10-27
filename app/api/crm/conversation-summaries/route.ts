import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmConversationSummary from "@/models/crm/ConversationSummary";

import { requireTenantId } from "@/lib/auth/requireTenantId";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const tenantGuard = requireTenantId(session);
  if (tenantGuard) return tenantGuard;

  const { searchParams } = new URL(req.url);
  const recordType = searchParams.get("recordType");
  const recordId = searchParams.get("recordId");

  await dbConnect();

  const query: Record<string, any> = {
    tenantId: session.user.tenantId,
  };
  if (recordType) query.recordType = recordType;
  if (recordId) query.recordId = recordId;

  const summaries = await CrmConversationSummary.find(query)
    .sort({ generatedAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: summaries });
}

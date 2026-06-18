import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmIntegrationLink from "@/models/crm/IntegrationLink";
import { checkErpSyncStatus } from "@/lib/crm/integrations/erpSync";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId");

  const query: any = { tenantId: session.user.tenantId };
  if (recordId) query.crmRecordId = recordId;

  const links = await CrmIntegrationLink.find(query).lean();

  const data = links.map(link => ({
    ...link,
    health: checkErpSyncStatus(link)
  }));

  return NextResponse.json({ success: true, data });
}

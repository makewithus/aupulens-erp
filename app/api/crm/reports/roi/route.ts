import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { calculateCampaignROI, calculateGlobalROI, updateCampaignROI } from "@/lib/crm/roiEngine";
import { requirePermission } from "@/lib/crm/rbac";
import dbConnect from "@/lib/db";
import CrmCampaign from "@/models/crm/Campaign";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.analytics");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  const tenantId = session.user.tenantId;

  if (campaignId) {
    const metrics = await calculateCampaignROI(campaignId, tenantId);
    return NextResponse.json({ success: true, data: metrics });
  } else {
    const globalMetrics = await calculateGlobalROI(tenantId);
    return NextResponse.json({ success: true, data: globalMetrics });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.update");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  const url = new URL(req.url);
  const campaignId = url.searchParams.get("campaign_id");
  const tenantId = session.user.tenantId;

  if (campaignId) {
    const metrics = await updateCampaignROI(campaignId, tenantId);
    return NextResponse.json({ success: true, data: metrics });
  }

  // Force global update
  await dbConnect();
  const campaigns = await CrmCampaign.find({ tenantId, status: { $in: ["Active", "Completed"] } });
  const updates = [];
  for (const c of campaigns) {
    updates.push(updateCampaignROI(String(c._id), tenantId));
  }
  await Promise.all(updates);

  return NextResponse.json({ success: true, message: "All campaign ROIs updated" });
}

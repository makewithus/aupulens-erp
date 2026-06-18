import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCampaign from "@/models/crm/Campaign";
import { getAttributionBreakdownByChannel } from "@/lib/crm/attributionEngine";
import { requirePermission } from "@/lib/crm/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.analytics");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const tenantId = session.user.tenantId;

  // Overview metrics
  const [campaigns, channelAttribution] = await Promise.all([
    CrmCampaign.find({ tenantId }).lean(),
    getAttributionBreakdownByChannel(tenantId),
  ]);

  const activeCampaigns = campaigns.filter(c => c.status === "Active").length;
  const completedCampaigns = campaigns.filter(c => c.status === "Completed").length;

  // Find top / worst campaigns by ROI
  const sortedByROI = [...campaigns].sort((a, b) => ((b.roi_percentage || 0) - (a.roi_percentage || 0)));
  const topCampaigns = sortedByROI.slice(0, 5);
  const worstCampaigns = [...sortedByROI].reverse().filter(c => c.status === "Completed" || c.status === "Active").slice(0, 5);

  return NextResponse.json({
    success: true,
    data: {
      overview: {
        totalCampaigns: campaigns.length,
        activeCampaigns,
        completedCampaigns,
      },
      channelAttribution,
      topCampaigns,
      worstCampaigns
    }
  });
}

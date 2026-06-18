import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCampaign from "@/models/crm/Campaign";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { requirePermission } from "@/lib/crm/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.read");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const url = new URL(req.url);
  const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (url.searchParams.get("status")) query.status = url.searchParams.get("status");
  if (url.searchParams.get("channel")) query.channel = url.searchParams.get("channel");
  if (url.searchParams.get("owner_id")) query.owner_id = url.searchParams.get("owner_id");
  if (url.searchParams.get("search")) {
    query.$or = [
      { campaign_name: { $regex: url.searchParams.get("search"), $options: "i" } },
      { campaign_code: { $regex: url.searchParams.get("search"), $options: "i" } },
    ];
  }

  const [total, campaigns] = await Promise.all([
    CrmCampaign.countDocuments(query),
    CrmCampaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("owner_id", "name email")
      .lean(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      campaigns,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.create");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  if (!body.campaign_name || !body.campaign_code || !body.channel || !body.start_date) {
    return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 422 });
  }

  const existing = await CrmCampaign.findOne({ tenantId: session.user.tenantId, campaign_code: body.campaign_code });
  if (existing) {
    return NextResponse.json({ success: false, message: "Campaign code must be unique" }, { status: 422 });
  }

  const campaign = await CrmCampaign.create({
    ...body,
    tenantId: session.user.tenantId,
    owner_id: body.owner_id || session.user.id,
    createdBy: session.user.id,
    status: body.status || "Draft",
    attributed_revenue: 0,
    actual_revenue: 0,
    roi_percentage: 0,
  });

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "created",
    record_type: "Campaign",
    record_id: campaign._id,
    new_value: campaign.campaign_name,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true, data: campaign }, { status: 201 });
}

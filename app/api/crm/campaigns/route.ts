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

  // A campaign spans [start_date, end_date], so "within this filter window"
  // means the two ranges overlap — a campaign that started before the
  // window but is still running (or has no end_date, i.e. open-ended)
  // should still match.
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const overlapConditions: Record<string, unknown>[] = [];
  if (dateFrom && !isNaN(Date.parse(dateFrom))) {
    overlapConditions.push({ $or: [{ end_date: { $gte: new Date(dateFrom) } }, { end_date: { $exists: false } }] });
  }
  if (dateTo && !isNaN(Date.parse(dateTo))) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    overlapConditions.push({ start_date: { $lte: end } });
  }
  if (overlapConditions.length > 0) {
    (query as any).$and = [...((query as any).$and || []), ...overlapConditions];
  }

  const baseQuery = CrmCampaign.find(query).sort({ createdAt: -1 }).populate("owner_id", "name email");

  // Pagination is opt-in via `page` — omitting it keeps returning everything,
  // matching the convention used across the rest of this codebase.
  const pageParam = url.searchParams.get("page");
  if (!pageParam) {
    const campaigns = await baseQuery.lean();
    return NextResponse.json({ success: true, data: { campaigns, total: campaigns.length, page: 1, totalPages: 1 } });
  }

  const page = Math.max(parseInt(pageParam), 1);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
  const skip = (page - 1) * limit;

  const [total, campaigns] = await Promise.all([
    CrmCampaign.countDocuments(query),
    baseQuery.skip(skip).limit(limit).lean(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      campaigns,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
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

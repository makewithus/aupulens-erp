import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCampaign from "@/models/crm/Campaign";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { requirePermission } from "@/lib/crm/rbac";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.read");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const campaign = await CrmCampaign.findOne({ _id: id, tenantId: session.user.tenantId })
    .populate("owner_id", "name email");

  if (!campaign) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: campaign });
}

export async function PUT(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.update");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  const campaign = await CrmCampaign.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!campaign) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  const oldStatus = campaign.status;

  Object.assign(campaign, body);
  await campaign.save();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "updated",
    record_type: "Campaign",
    record_id: id,
    timestamp: new Date(),
  });

  if (body.status && body.status !== oldStatus) {
    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "status_changed",
      record_type: "Campaign",
      record_id: id,
      field_name: "status",
      old_value: oldStatus,
      new_value: body.status,
      timestamp: new Date(),
    });
  }

  return NextResponse.json({ success: true, data: campaign });
}

export async function DELETE(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "campaign.delete");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const campaign = await CrmCampaign.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!campaign) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  if (["Active", "Completed"].includes(campaign.status)) {
    return NextResponse.json({ success: false, message: "Cannot delete Active or Completed campaigns" }, { status: 422 });
  }

  await campaign.deleteOne();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "deleted",
    record_type: "Campaign",
    record_id: id,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true });
}

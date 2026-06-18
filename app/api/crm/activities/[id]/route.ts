import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  
  const activity = await CrmActivity.findOne({ _id: params.id, tenantId: session.user.tenantId }).populate('performed_by_id', 'name');
  if (!activity) return NextResponse.json({ success: false }, { status: 404 });
  return NextResponse.json({ success: true, data: activity });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();

  const activity = await CrmActivity.findOneAndUpdate(
    { _id: params.id, tenantId: session.user.tenantId },
    await req.json(),
    { new: true }
  );
  
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'updated',
    record_type: 'Activity',
    record_id: params.id,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: activity });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();

  await CrmActivity.findOneAndDelete({ _id: params.id, tenantId: session.user.tenantId });

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'deleted',
    record_type: 'Activity',
    record_id: params.id,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true });
}

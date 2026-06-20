import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { sendCaseNotification } from "@/lib/crm/caseNotifications";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId })
      .populate('account_id', 'company_name')
      .populate('contact_id', 'first_name last_name')
      .populate('owner_id', 'name').lean();
    
  if (!crmCase) return NextResponse.json({ success: false }, { status: 404 });
  return NextResponse.json({ success: true, data: crmCase });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!crmCase) return NextResponse.json({ success: false }, { status: 404 });

  try {
    const body = await req.json();
    const oldStatus = crmCase.status;
    
    if (body.status === 'Closed' && crmCase.status !== 'Closed') {
      if (!body.resolution_summary || body.resolution_summary.length < 20) {
        return NextResponse.json({ success: false, message: "Resolution summary min 20 chars required to close" }, { status: 422 });
      }
    }

    Object.assign(crmCase, body);
    await crmCase.save();

    if (oldStatus !== body.status && body.status === 'Resolved') {
      await sendCaseNotification(session.user.tenantId, 'Resolved', crmCase, session.user.id);
    }

    if (body.satisfaction_score && !crmCase.satisfaction_submitted_at) {
      crmCase.satisfaction_submitted_at = new Date();
      await crmCase.save();
      await sendCaseNotification(session.user.tenantId, 'Satisfaction Rated', crmCase, session.user.id);
    }

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: oldStatus !== body.status ? 'status_changed' : 'updated',
      record_type: 'Case',
      record_id: params.id,
      timestamp: new Date()
    });

    return NextResponse.json({ success: true, data: crmCase });
  } catch (error: any) {
    console.error("Error updating case:", error);
    return NextResponse.json({ success: false, message: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  await CrmCase.findOneAndDelete({ _id: params.id, tenantId: session.user.tenantId });
  
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'deleted',
    record_type: 'Case',
    record_id: params.id,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true });
}

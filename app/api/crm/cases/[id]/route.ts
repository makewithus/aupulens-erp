import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { sendCaseNotification } from "@/lib/crm/caseNotifications";
import { validateObjectId, handleRouteError, stripProtectedFields } from "@/lib/api/validateId";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    
    await dbConnect();
    const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId })
        .populate('account_id', 'company_name')
        .populate('contact_id', 'first_name last_name')
        .populate('owner_id', 'name').lean();

    if (!crmCase) return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: crmCase });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId });
    if (!crmCase) return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 });

    const body = stripProtectedFields(await req.json());
    const safeUpdates = stripProtectedFields(body);
    const oldStatus = crmCase.status;
    
    if (body.status === 'Closed' && crmCase.status !== 'Closed') {
      if (!body.resolution_summary || body.resolution_summary.length < 20) {
        return NextResponse.json({ success: false, message: "Resolution summary min 20 chars required to close" }, { status: 422 });
      }
    }

    Object.assign(crmCase, safeUpdates);
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
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const idGuard = validateObjectId(params.id);
    if (idGuard) return idGuard;

    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    await dbConnect();
    const crmCase = await CrmCase.findOneAndDelete({ _id: params.id, tenantId: session.user.tenantId });
    if (!crmCase) return NextResponse.json({ success: false, message: "Case not found" }, { status: 404 });

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: 'deleted',
      record_type: 'Case',
      record_id: params.id,
      timestamp: new Date()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

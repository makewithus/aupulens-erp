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
  const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId }).select('satisfaction_score satisfaction_comment satisfaction_submitted_at').lean();
  
  if (!crmCase) return NextResponse.json({ success: false }, { status: 404 });
  return NextResponse.json({ success: true, data: crmCase });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId });
  
  if (!crmCase) return NextResponse.json({ success: false }, { status: 404 });
  if (crmCase.satisfaction_submitted_at) return NextResponse.json({ success: false, message: "Satisfaction already submitted." }, { status: 422 });

  const body = await req.json();
  if (!body.rating || body.rating < 1 || body.rating > 5) return NextResponse.json({ success: false, message: "Invalid rating" }, { status: 422 });

  crmCase.satisfaction_score = body.rating;
  crmCase.satisfaction_comment = body.comment;
  crmCase.satisfaction_submitted_at = new Date();
  
  await crmCase.save();

  await sendCaseNotification(session.user.tenantId, 'Satisfaction Rated', crmCase, session.user.id);
  
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'satisfaction_submission',
    record_type: 'Case',
    record_id: params.id,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: crmCase });
}

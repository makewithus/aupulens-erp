import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";
import CrmActivity from "@/models/crm/Activity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { calculateSlaTarget } from "@/lib/crm/slaEngine";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!crmCase) return NextResponse.json({ success: false }, { status: 404 });
  if (crmCase.status !== 'Closed') return NextResponse.json({ success: false, message: "Can only reopen closed cases" }, { status: 422 });

  crmCase.status = 'Reopened';
  crmCase.sla_target_at = calculateSlaTarget(crmCase.severity || 'Medium');
  crmCase.sla_breached = false;
  await crmCase.save();

  await CrmActivity.create({
    tenantId: session.user.tenantId,
    type: 'Support Interaction',
    subject: `Case Reopened`,
    linked_case_id: params.id,
    createdBy: session.user.id,
    performed_by_id: session.user.id
  });

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'updated',
    record_type: 'Case',
    record_id: params.id,
    field_name: 'status',
    new_value: 'Reopened',
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: crmCase });
}

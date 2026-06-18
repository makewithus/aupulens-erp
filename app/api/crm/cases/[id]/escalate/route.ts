import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";
import CrmActivity from "@/models/crm/Activity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { sendCaseNotification } from "@/lib/crm/caseNotifications";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const crmCase = await CrmCase.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!crmCase) return NextResponse.json({ success: false }, { status: 404 });

  const oldLevel = crmCase.escalation_level || 0;
  crmCase.escalation_level = Math.min(oldLevel + 1, 4);
  
  if (!crmCase.escalation_history) crmCase.escalation_history = [];
  crmCase.escalation_history.push({
    level: crmCase.escalation_level,
    previous_level: oldLevel,
    trigger: 'Manual Escalation',
    user_id: session.user.id as any,
    timestamp: new Date()
  });
  
  await crmCase.save();
  await sendCaseNotification(session.user.tenantId, 'Escalated', crmCase, session.user.id);

  await CrmActivity.create({
    tenantId: session.user.tenantId,
    type: 'Support Interaction',
    subject: `Case Escalated to Level ${crmCase.escalation_level}`,
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
    field_name: 'escalation_level',
    new_value: crmCase.escalation_level.toString(),
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: crmCase });
}

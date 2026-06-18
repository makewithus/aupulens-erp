import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCase from "@/models/crm/Case";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmTask from "@/models/crm/Task";
import { calculateSlaTarget } from "@/lib/crm/slaEngine";
import { logSystemActivity } from "@/lib/crm/activityLogger";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const query: any = { tenantId: session.user.tenantId };
  
  if (searchParams.get('status')) query.status = searchParams.get('status');
  if (searchParams.get('severity')) query.severity = searchParams.get('severity');
  
  const total = await CrmCase.countDocuments(query);
  const cases = await CrmCase.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('account_id', 'company_name')
    .populate('owner_id', 'name email');
    
  return NextResponse.json({ success: true, data: { cases, total, page } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const body = await req.json();
  body.tenantId = session.user.tenantId;
  body.createdBy = session.user.id;
  body.sla_target_at = calculateSlaTarget(body.severity || 'Low');
  
  const crmCase = await CrmCase.create(body);

  await CrmTask.create({
    tenantId: session.user.tenantId,
    title: `First Response: ${body.title}`,
    category: 'Resolve Issue',
    assigned_to_id: body.owner_id || session.user.id,
    due_date: body.sla_target_at,
    linked_case_id: crmCase._id,
    createdBy: session.user.id,
    status: 'Pending',
    priority: 'High'
  });

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'created',
    record_type: 'Case',
    record_id: crmCase._id,
    timestamp: new Date()
  });

  await logSystemActivity({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    type: 'Support Interaction',
    subject: `Support Case Created: ${crmCase.title}`,
    linked_case_id: crmCase._id.toString(),
    linked_account_id: crmCase.account_id?.toString()
  });

  return NextResponse.json({ success: true, data: crmCase });
}

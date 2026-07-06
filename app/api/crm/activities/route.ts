import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { requireRole } from "@/lib/crm/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  requireRole(session, ['view_activities']); // Hook prepared for future

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const query: any = { tenantId: session.user.tenantId };
  
  if (searchParams.get('linked_record_id')) {
    query.$or = [
      { linked_lead_id: searchParams.get('linked_record_id') },
      { linked_account_id: searchParams.get('linked_record_id') },
      { linked_contact_id: searchParams.get('linked_record_id') },
      { linked_opportunity_id: searchParams.get('linked_record_id') },
      { linked_case_id: searchParams.get('linked_record_id') }
    ];
  }
  if (searchParams.get('type')) query.type = searchParams.get('type');

  const total = await CrmActivity.countDocuments(query);
  const activities = await CrmActivity.find(query)
    .sort({ activity_date: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('performed_by_id', 'name email')
    .lean();

  // Metrics for dashboard
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const [activitiesToday, activitiesThisWeek, callsLogged, meetingsLogged, quotesSent, tasksCompleted] = await Promise.all([
    CrmActivity.countDocuments({ ...query, activity_date: { $gte: today } }),
    CrmActivity.countDocuments({ ...query, activity_date: { $gte: startOfWeek } }),
    CrmActivity.countDocuments({ ...query, type: 'Call' }),
    CrmActivity.countDocuments({ ...query, type: 'Meeting' }),
    CrmActivity.countDocuments({ ...query, type: 'Quote Sent' }),
    CrmActivity.countDocuments({ ...query, type: 'Task' }), // Simplified for now
  ]);

  return NextResponse.json({ 
    success: true, 
    data: { 
      activities, 
      total, 
      page, 
      totalPages: Math.ceil(total / limit),
      stats: {
        activitiesToday,
        activitiesThisWeek,
        callsLogged,
        meetingsLogged,
        quotesSent,
        tasksCompleted
      }
    } 
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ['create_activities']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  const body = await req.json();
  body.tenantId = session.user.tenantId;
  body.createdBy = session.user.id;
  body.performed_by_id = session.user.id;
  
  const activity = await CrmActivity.create(body);

  // Audit Log
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'created',
    record_type: 'Activity',
    record_id: activity._id,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: activity });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmTask from "@/models/crm/Task";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'my';
  const query: any = { tenantId: session.user.tenantId };
  
  if (view === 'my') query.assigned_to_id = session.user.id;
  if (searchParams.get('status')) query.status = searchParams.get('status');

  // Overdue engine bulk update
  await CrmTask.updateMany(
    { tenantId: session.user.tenantId, status: 'Pending', due_date: { $lt: new Date() } },
    { $set: { status: 'Overdue' } }
  );

  const limit = parseInt(searchParams.get('limit') || '50');
  const tasks = await CrmTask.find(query)
    .sort({ due_date: 1 })
    .limit(limit)
    .lean()
    .populate('assigned_to_id', 'name email');

  return NextResponse.json({ success: true, data: tasks });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const body = await req.json();
  body.tenantId = session.user.tenantId;
  body.createdBy = session.user.id;
  if (!body.assigned_to_id) body.assigned_to_id = session.user.id;

  const task = await CrmTask.create(body);

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'created',
    record_type: 'Task',
    record_id: task._id,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: task });
}

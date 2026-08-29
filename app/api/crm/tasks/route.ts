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
  if (searchParams.get('priority')) query.priority = searchParams.get('priority');

  // Overdue engine bulk update
  await CrmTask.updateMany(
    { tenantId: session.user.tenantId, status: 'Pending', due_date: { $lt: new Date() } },
    { $set: { status: 'Overdue' } }
  );

  const baseQuery = CrmTask.find(query).sort({ due_date: 1 }).populate('assigned_to_id', 'name email');

  // Pagination is opt-in via `page` — omitting it keeps returning everything,
  // matching the convention used across the rest of this codebase.
  const pageParam = searchParams.get('page');
  if (!pageParam) {
    const tasks = await baseQuery.lean();
    return NextResponse.json({ success: true, data: tasks, total: tasks.length, page: 1, totalPages: 1 });
  }

  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));

  const [total, tasks] = await Promise.all([
    CrmTask.countDocuments(query),
    baseQuery.skip((page - 1) * limit).limit(limit).lean(),
  ]);

  return NextResponse.json({ success: true, data: tasks, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
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

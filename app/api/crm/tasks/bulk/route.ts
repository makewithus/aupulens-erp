import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmTask from "@/models/crm/Task";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { requireRole } from "@/lib/crm/rbac";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ['task.update']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  const { taskIds, operation, payload } = await req.json();

  if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
    return NextResponse.json({ success: false, message: 'No tasks provided' }, { status: 400 });
  }

  const query = { _id: { $in: taskIds }, tenantId: session.user.tenantId };
  let updateData: any = {};

  if (operation === 'assign') {
    const assignCheck = requireRole(session, ['task.assign']);
    if (assignCheck) return assignCheck;
    updateData = { assigned_to_id: payload.assigned_to_id };
  } else if (operation === 'complete') {
    updateData = { status: 'Completed', completed_at: new Date() };
  } else if (operation === 'cancel') {
    updateData = { status: 'Cancelled' };
  } else if (operation === 'delete') {
    const deleteCheck = requireRole(session, ['task.delete']);
    if (deleteCheck) return deleteCheck;
    await CrmTask.deleteMany(query);

    // Audit log
    await CrmAuditLog.insertMany(
      taskIds.map((id: string) => ({ tenantId: session.user.tenantId, user_id: session.user.id, action: 'deleted', record_type: 'Task', record_id: id, timestamp: new Date() }))
    );
    return NextResponse.json({ success: true, message: 'Deleted' });
  } else {
    return NextResponse.json({ success: false, message: 'Invalid operation' }, { status: 400 });
  }

  await CrmTask.updateMany(query, { $set: updateData });

  await CrmAuditLog.insertMany(
    taskIds.map((id: string) => ({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: 'bulk_updated',
      record_type: 'Task',
      record_id: id,
      field_name: operation,
      timestamp: new Date()
    }))
  );

  return NextResponse.json({ success: true });
}

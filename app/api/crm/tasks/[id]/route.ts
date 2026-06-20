import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmTask from "@/models/crm/Task";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import mongoose from "mongoose";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  
  const task = await CrmTask.findOne({ _id: params.id, tenantId: session.user.tenantId }).populate('assigned_to_id', 'name').lean();
  if (!task) return NextResponse.json({ success: false }, { status: 404 });
  return NextResponse.json({ success: true, data: task });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();

  const task = await CrmTask.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!task) return NextResponse.json({ success: false }, { status: 404 });

  const body = await req.json();
  const oldStatus = task.status;
  
  Object.assign(task, body);
  
  if (body.status === 'Completed' && oldStatus !== 'Completed') {
    task.completed_at = new Date();
    
    // Recurrence logic
    if (task.is_recurring) {
      const nextDue = new Date(task.due_date);
      if (task.recurrence_rule === 'daily') nextDue.setDate(nextDue.getDate() + 1);
      else if (task.recurrence_rule === 'weekly') nextDue.setDate(nextDue.getDate() + 7);
      else if (task.recurrence_rule === 'monthly') nextDue.setMonth(nextDue.getMonth() + 1);
      
      const newTaskObj = task.toObject();
      delete (newTaskObj as any)._id;
      delete (newTaskObj as any).createdAt;
      delete (newTaskObj as any).updatedAt;
      
      await CrmTask.create({
        ...newTaskObj,
        status: 'Pending',
        completed_at: undefined,
        due_date: nextDue
      });
    }
  }

  await task.save();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'updated',
    record_type: 'Task',
    record_id: params.id,
    field_name: 'status',
    new_value: body.status,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: task });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmActivity from "@/models/crm/Activity";
import CrmTask from "@/models/crm/Task";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const activities = await CrmActivity.find({ linked_lead_id: params.id, tenantId: session.user.tenantId })
      .sort({ activity_date: -1 })
      .populate('performed_by_id', 'name').lean();
    
  return NextResponse.json({ success: true, data: activities });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const body = await req.json();
  body.tenantId = session.user.tenantId;
  body.linked_lead_id = params.id;
  body.createdBy = session.user.id;
  body.performed_by_id = session.user.id;
  
  const activity = await CrmActivity.create(body);
  
  if (body.followup_date) {
    await CrmTask.create({
      tenantId: session.user.tenantId,
      title: `Follow up: ${body.subject}`,
      category: 'Call Back',
      assigned_to_id: session.user.id,
      due_date: new Date(body.followup_date),
      linked_lead_id: params.id,
      createdBy: session.user.id
    });
  }
  
  return NextResponse.json({ success: true, data: activity });
}

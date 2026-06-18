import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmCommunication from "@/models/crm/Communication";
import CrmActivity from "@/models/crm/Activity";
import { requirePermission } from "@/lib/crm/rbac";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "communication.view");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId");
  const channel = url.searchParams.get("channel");

  const query: any = { tenantId: session.user.tenantId };
  if (recordId) query.recordId = recordId;
  if (channel) query.channel = channel;

  const communications = await CrmCommunication.find(query)
    .sort({ createdAt: -1 })
    .populate("createdBy", "name email")
    .lean();

  return NextResponse.json({ success: true, data: communications });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  try {
    requirePermission(session, "communication.create");
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 403 });
  }

  await dbConnect();
  const body = await req.json();

  if (!body.recordId || !body.recordType || !body.channel || !body.message) {
    return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 422 });
  }

  const status = body.scheduledAt ? "Scheduled" : "Sent";
  const sentAt = status === "Sent" ? new Date() : undefined;

  const comm = await CrmCommunication.create({
    ...body,
    tenantId: session.user.tenantId,
    status,
    sentAt,
    createdBy: session.user.id,
  });

  // Create an Activity so it shows up in the Unified Timeline
  await CrmActivity.create({
    tenantId: session.user.tenantId,
    activity_type: body.channel,
    record_type: body.recordType,
    record_id: body.recordId,
    subject: `Communication: ${body.subject || body.channel}`,
    description: body.message,
    status: "Completed",
    due_date: new Date(),
    owner_id: session.user.id,
    createdBy: session.user.id
  });

  return NextResponse.json({ success: true, data: comm }, { status: 201 });
}

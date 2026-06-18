import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmFieldVisit from "@/models/crm/FieldVisit";
import CrmActivity from "@/models/crm/Activity";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const recordId = url.searchParams.get("recordId");
  const userId = url.searchParams.get("userId") || session.user.id;

  const query: any = { tenantId: session.user.tenantId, createdBy: userId };
  if (recordId) query.recordId = recordId;

  const visits = await CrmFieldVisit.find(query).sort({ visit_start: -1 }).lean();

  return NextResponse.json({ success: true, data: visits });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.recordType || !body.recordId || !body.latitude || !body.longitude) {
    return NextResponse.json({ success: false, message: "Missing required location or record fields" }, { status: 422 });
  }

  const visit = await CrmFieldVisit.create({
    ...body,
    tenantId: session.user.tenantId,
    visit_start: body.visit_start || new Date(),
    createdBy: session.user.id
  });

  // Log an activity for the field visit so it appears on the unified timeline
  await CrmActivity.create({
    tenantId: session.user.tenantId,
    activity_type: "Field Visit",
    record_type: body.recordType,
    record_id: body.recordId,
    subject: `Field Visit Check-In`,
    status: body.status === "Checked Out" ? "Completed" : "In Progress",
    owner_id: session.user.id,
    createdBy: session.user.id
  });

  return NextResponse.json({ success: true, data: visit }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmHandoff from "@/models/crm/Handoff";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // "incoming" or "outgoing"

  const query: any = { tenantId: session.user.tenantId };
  if (type === "incoming") query.toOwner = session.user.id;
  if (type === "outgoing") query.fromOwner = session.user.id;
  
  if (url.searchParams.get("recordId")) query.recordId = url.searchParams.get("recordId");

  const handoffs = await CrmHandoff.find(query)
    .populate("fromOwner", "name")
    .populate("toOwner", "name")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: handoffs });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  if (!body.recordId || !body.toOwner || !body.handoffType) {
    return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 422 });
  }

  const handoff = await CrmHandoff.create({
    ...body,
    tenantId: session.user.tenantId,
    fromOwner: session.user.id,
    createdBy: session.user.id
  });

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "created",
    record_type: "Handoff",
    record_id: handoff._id,
    new_value: `Handoff created for ${body.toOwner}`,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: handoff }, { status: 201 });
}

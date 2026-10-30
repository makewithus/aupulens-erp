import { handleRouteError, isValidObjectId, stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmHandoff from "@/models/crm/Handoff";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmCase from "@/models/crm/Case";
import CrmQuote from "@/models/crm/Quote";
import CrmAccount from "@/models/crm/Account";
import User from "@/models/auth/User";

const RECORD_MODELS = {
  Opportunity: CrmOpportunity,
  Case: CrmCase,
  Quote: CrmQuote,
  Account: CrmAccount,
} as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // "incoming" or "outgoing"

  const query: any = { tenantId: session.user.tenantId };
  if (type === "incoming") query.toOwner = session.user.id;
  if (type === "outgoing") query.fromOwner = session.user.id;
  
  const recordId = url.searchParams.get("recordId");
  if (recordId) {
    if (!isValidObjectId(recordId)) {
      return NextResponse.json({ success: false, message: "Record ID must be a valid 24-character CRM ID." }, { status: 400 });
    }
    query.recordId = recordId;
  }

  const handoffs = await CrmHandoff.find(query)
    .populate("fromOwner", "name")
    .populate("toOwner", "name")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: handoffs });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId || !session.user.id) return NextResponse.json({ success: false }, { status: 401 });

    const body = stripProtectedFields(await req.json());
    const { recordType, recordId, toOwner, handoffType, priority, notes } = body;

    if (!recordId || !toOwner || !handoffType) {
      return NextResponse.json({ success: false, message: "Record ID, receiving teammate, and handoff type are required." }, { status: 422 });
    }
    if (typeof recordType !== "string" || !Object.hasOwn(RECORD_MODELS, recordType)) {
      return NextResponse.json({ success: false, message: "Choose a supported CRM record type." }, { status: 400 });
    }
    if (!isValidObjectId(recordId)) {
      return NextResponse.json({ success: false, message: "Record ID must be a valid 24-character CRM ID." }, { status: 400 });
    }
    if (!isValidObjectId(toOwner)) {
      return NextResponse.json({ success: false, message: "Choose a valid receiving teammate." }, { status: 400 });
    }
    if (typeof handoffType !== "string" || !handoffType.trim()) {
      return NextResponse.json({ success: false, message: "Handoff type is required." }, { status: 422 });
    }
    const allowedPriorities = ["Low", "Medium", "High", "Critical"];
    if (priority !== undefined && !allowedPriorities.includes(String(priority))) {
      return NextResponse.json({ success: false, message: "Choose a supported priority." }, { status: 400 });
    }

    await dbConnect();
    const RecordModel = RECORD_MODELS[recordType as keyof typeof RECORD_MODELS];
    const record = await RecordModel.exists({ _id: recordId, tenantId: session.user.tenantId });
    if (!record) {
      return NextResponse.json({ success: false, message: `${recordType} record was not found in this workspace.` }, { status: 404 });
    }
    const recipient = await User.exists({ _id: toOwner, tenantId: session.user.tenantId });
    if (!recipient) {
      return NextResponse.json({ success: false, message: "Receiving teammate was not found in this workspace." }, { status: 404 });
    }

    const handoff = await CrmHandoff.create({
      tenantId: session.user.tenantId,
      recordType,
      recordId,
      handoffType: handoffType.trim(),
      fromOwner: session.user.id,
      toOwner,
      priority: priority || "Medium",
      notes: typeof notes === "string" ? notes.trim() : "",
      createdBy: session.user.id,
    });

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "created",
      record_type: "Handoff",
      record_id: handoff._id,
      new_value: `Handoff created for ${toOwner}`,
      timestamp: new Date()
    });

    return NextResponse.json({ success: true, data: handoff }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

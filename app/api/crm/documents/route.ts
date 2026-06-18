import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmDocument from "@/models/crm/CrmDocument";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

// ─── GET /api/crm/documents ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  const url = new URL(req.url);
  const linked_record_id = url.searchParams.get("linked_record_id");
  const linked_record_type = url.searchParams.get("linked_record_type");
  const include_archived = url.searchParams.get("include_archived") === "true";
  const search = url.searchParams.get("search");

  await dbConnect();

  const query: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (!include_archived) query.is_archived = false;
  if (linked_record_id) query.linked_record_id = linked_record_id;
  if (linked_record_type) query.linked_record_type = linked_record_type;
  if (search) query.name = { $regex: search, $options: "i" };

  const documents = await CrmDocument.find(query)
    .populate("uploaded_by_id", "name email")
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: { documents } });
}

// ─── POST /api/crm/documents ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  const { name, file_url, file_type, linked_record_type, linked_record_id, parent_document_id } =
    body;

  if (!name || !file_url || !linked_record_id) {
    return NextResponse.json(
      { success: false, message: "name, file_url and linked_record_id are required." },
      { status: 422 }
    );
  }

  // Determine version number
  let version = 1;
  if (parent_document_id) {
    const parent = await CrmDocument.findOne({
      _id: parent_document_id,
      tenantId: session.user.tenantId,
    });
    if (parent) version = parent.version + 1;
  }

  const doc = await CrmDocument.create({
    tenantId: session.user.tenantId,
    name,
    file_url,
    file_type,
    linked_record_type,
    linked_record_id,
    parent_document_id: parent_document_id || undefined,
    uploaded_by_id: session.user.id,
    version,
    is_archived: false,
    download_count: 0,
  });

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "upload",
    record_type: "Document",
    record_id: doc._id,
    new_value: name,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true, data: doc }, { status: 201 });
}

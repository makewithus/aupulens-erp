import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmDocument from "@/models/crm/CrmDocument";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

type RouteProps = { params: Promise<{ id: string }> };

// ─── GET /api/crm/documents/[id] ─────────────────────────────────────────────
// Fetches document metadata; increments download count and logs audit
export async function GET(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();

  const doc = await CrmDocument.findOne({ _id: id, tenantId: session.user.tenantId })
    .populate("uploaded_by_id", "name email");

  if (!doc)
    return NextResponse.json({ success: false, message: "Document not found" }, { status: 404 });

  // Determine if this is a preview or a download from query param
  const url = new URL(req.url);
  const isDownload = url.searchParams.get("action") !== "preview";

  if (isDownload) {
    doc.download_count += 1;
    await doc.save();

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "download",
      record_type: "Document",
      record_id: doc._id,
      timestamp: new Date(),
    });
  } else {
    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "view",
      record_type: "Document",
      record_id: doc._id,
      timestamp: new Date(),
    });
  }

  return NextResponse.json({ success: true, data: doc });
}

// ─── PATCH /api/crm/documents/[id] ───────────────────────────────────────────
// Archive / unarchive, rename
export async function PATCH(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();

  const doc = await CrmDocument.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!doc)
    return NextResponse.json({ success: false, message: "Document not found" }, { status: 404 });

  const body = await req.json();

  if (body.is_archived !== undefined) {
    const prevArchived = doc.is_archived;
    doc.is_archived = body.is_archived;
    await doc.save();

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "status_changed",
      record_type: "Document",
      record_id: doc._id,
      old_value: prevArchived ? "archived" : "active",
      new_value: body.is_archived ? "archived" : "active",
      timestamp: new Date(),
    });
  }

  if (body.name !== undefined) {
    doc.name = body.name;
    await doc.save();

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "updated",
      record_type: "Document",
      record_id: doc._id,
      field_name: "name",
      old_value: doc.name,
      new_value: body.name,
      timestamp: new Date(),
    });
  }

  return NextResponse.json({ success: true, data: doc });
}

// ─── DELETE /api/crm/documents/[id] ─────────────────────────────────────────
export async function DELETE(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();

  const doc = await CrmDocument.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!doc)
    return NextResponse.json({ success: false, message: "Document not found" }, { status: 404 });

  await doc.deleteOne();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "deleted",
    record_type: "Document",
    record_id: id,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true });
}

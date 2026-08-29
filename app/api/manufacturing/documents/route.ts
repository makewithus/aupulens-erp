import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import DocumentModel from "@/models/manufacturing/Document";

const ALLOWED_ROLES = ["manufacturing", "admin", "master-admin"];

export async function GET() {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();
    const documents = await DocumentModel.find({ tenantId, linked_record_type: "shipment", is_archived: false })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ documents });
  } catch (error) {
    console.error("Error fetching documents:", error);
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const userId = (session.user as any).id;

    const body = await req.json();
    if (!body.name || !body.file_url) {
      return NextResponse.json({ error: "name and file_url are required" }, { status: 400 });
    }

    await connectDB();
    const doc = await DocumentModel.create({
      tenantId,
      name: body.name,
      file_url: body.file_url,
      file_type: body.file_type || "",
      size: Number(body.size) || 0,
      linked_record_type: "shipment",
      linked_record_id: body.linked_record_id || undefined,
      uploaded_by_id: userId,
    });
    return NextResponse.json({ document: doc }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating document:", error);
    return NextResponse.json({ error: error.message || "Failed to save document" }, { status: 500 });
  }
}

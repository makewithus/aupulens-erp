import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import DocumentPrefix from "@/models/DocumentPrefix";
import { createPrefix, ensureDefaultPrefixes } from "@/lib/sales/documentPrefixes";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    await ensureDefaultPrefixes(session.user.tenantId);

    const { searchParams } = new URL(request.url);
    const query: any = { tenantId: session.user.tenantId };
    const documentType = searchParams.get("documentType");
    const kind = searchParams.get("kind");
    if (documentType) query.documentType = documentType;
    if (kind) query.kind = kind;

    const rows = await DocumentPrefix.find(query).sort({ documentType: 1, kind: 1, value: 1 }).lean();
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const body = await request.json();

    if (!body.documentType || !body.value) {
      return NextResponse.json({ success: false, message: "documentType and value are required" }, { status: 400 });
    }

    const doc = await createPrefix({
      tenantId,
      documentType: body.documentType,
      kind: body.kind,
      value: body.value,
      isDefault: body.isDefault,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 11000) {
      return NextResponse.json({ success: false, message: "That prefix/suffix value already exists for this document type" }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

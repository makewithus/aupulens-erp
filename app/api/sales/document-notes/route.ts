import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { auth } from "@/auth";
import DocumentNote from "@/models/DocumentNote";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { searchParams } = new URL(request.url);
    const query: any = { tenantId: session.user.tenantId };
    const kind = searchParams.get("kind");
    const documentType = searchParams.get("documentType");
    if (kind) query.kind = kind;
    if (documentType) query.documentType = documentType;

    const rows = await DocumentNote.find(query).sort({ createdAt: -1 }).lean();
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
    const body = await request.json();
    if (!body.kind || !body.documentType || !body.title) {
      return NextResponse.json({ success: false, message: "kind, documentType and title are required" }, { status: 400 });
    }

    const doc = await DocumentNote.create({
      tenantId: session.user.tenantId,
      kind: body.kind,
      documentType: body.documentType,
      title: body.title,
      content: body.content || "",
      isDefault: !!body.isDefault,
      createdBy: session.user.id,
    });

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

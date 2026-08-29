import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import EmailTemplate from "@/models/sales/EmailTemplate";

// Generic per-tenant template store keyed by an arbitrary string (see
// models/EmailTemplate.ts). GET creates a blank default on first read so the
// editor dialog always has something to show; PATCH persists edits.
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);
    const { searchParams } = new URL(request.url);
    const defaultName = searchParams.get("name") || decodedKey;
    const defaultSubject = searchParams.get("subject") || defaultName;
    const defaultBody = searchParams.get("body") || "Hi {{customerName}},\n\nThis is a notification regarding your subscription.\n\nThanks,\n{{companyName}}";

    let template = await EmailTemplate.findOne({ tenantId, key: decodedKey });
    if (!template) {
      template = await EmailTemplate.create({
        tenantId,
        key: decodedKey,
        name: defaultName,
        subject: defaultSubject,
        body: defaultBody,
      });
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error: any) {
    console.error("Email template GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { key } = await params;
    const decodedKey = decodeURIComponent(key);
    const body = await request.json();

    const template = await EmailTemplate.findOneAndUpdate(
      { tenantId, key: decodedKey },
      { $set: { subject: body.subject, body: body.body, ...(body.name ? { name: body.name } : {}) } },
      { new: true, upsert: true },
    );

    return NextResponse.json({ success: true, data: template });
  } catch (error: any) {
    console.error("Email template PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

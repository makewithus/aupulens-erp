import { NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import ExtractedDocument from "@/models/ExtractedDocument";

// GET /api/document-intelligence — list processed documents for this tenant.
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  await dbConnect();
  const docs = await ExtractedDocument.find({ tenantId: session.user.tenantId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return NextResponse.json({ success: true, data: docs });
}

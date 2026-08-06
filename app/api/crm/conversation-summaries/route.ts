import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmConversationSummary from "@/models/crm/ConversationSummary";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const { searchParams } = new URL(req.url);
  const recordType = searchParams.get("recordType");
  const recordId = searchParams.get("recordId");
  if (!recordType || !recordId) {
    return NextResponse.json({ success: false, message: "recordType and recordId are required" }, { status: 400 });
  }

  const summaries = await CrmConversationSummary.find({
    tenantId: session.user.tenantId,
    recordType,
    recordId,
  })
    .sort({ generatedAt: -1 })
    .lean();

  return NextResponse.json({ success: true, data: summaries });
}

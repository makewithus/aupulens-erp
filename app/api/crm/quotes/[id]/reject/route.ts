import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmQuote from "@/models/crm/Quote";
import CrmApprovalRequest from "@/models/crm/ApprovalRequest";
import { rejectQuote } from "@/lib/crm/approvalEngine";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();

  const quote = await CrmQuote.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!quote)
    return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

  if (quote.status !== "Pending Approval") {
    return NextResponse.json(
      { success: false, message: `Cannot reject a quote with status '${quote.status}'.` },
      { status: 422 }
    );
  }

  const pendingApproval = await CrmApprovalRequest.findOne({
    linked_record_id: quote._id,
    status: "Pending",
    approver_id: session.user.id,
  });

  const isAdmin = (session.user as any).role === "Admin";

  if (!pendingApproval && !isAdmin) {
    return NextResponse.json(
      { success: false, message: "You are not authorised to reject this quote." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  if (!body.notes?.trim()) {
    return NextResponse.json(
      { success: false, message: "Rejection notes are required." },
      { status: 422 }
    );
  }

  const updatedQuote = await rejectQuote(quote, session.user.id, body.notes);

  return NextResponse.json({ success: true, data: updatedQuote });
}

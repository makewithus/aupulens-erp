import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmQuote from "@/models/crm/Quote";
import CrmApprovalRequest from "@/models/crm/ApprovalRequest";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { approveQuote } from "@/lib/crm/approvalEngine";
import { logSystemActivity } from "@/lib/crm/activityLogger";

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

  if (quote.status !== "Pending Approval" && quote.status !== "Draft") {
    return NextResponse.json(
      { success: false, message: `Cannot approve a quote with status '${quote.status}'.` },
      { status: 422 }
    );
  }

  // Verify this user has a pending approval request for this quote,
  // OR is an Admin (who can always approve)
  const pendingApproval = await CrmApprovalRequest.findOne({
    linked_record_id: quote._id,
    status: "Pending",
    approver_id: session.user.id,
  });

  const isAdmin = (session.user as any).role === "Admin";

  if (!pendingApproval && !isAdmin) {
    return NextResponse.json(
      { success: false, message: "You are not authorised to approve this quote." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const updatedQuote = await approveQuote(quote, session.user.id, body.notes);

  await logSystemActivity({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    type: "Note",
    subject: `Quote Approved: ${quote.quote_number}`,
    description: body.notes ? `Notes: ${body.notes}` : undefined,
    linked_account_id: quote.account_id?.toString(),
    linked_opportunity_id: quote.opportunity_id?.toString()
  });

  return NextResponse.json({ success: true, data: updatedQuote });
}

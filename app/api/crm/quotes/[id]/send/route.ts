import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmQuote from "@/models/crm/Quote";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
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

  // Only Approved quotes can be sent
  if (quote.status !== "Approved") {
    return NextResponse.json(
      {
        success: false,
        message: `Only approved quotes can be sent. Current status: '${quote.status}'.`,
      },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const recipientEmail: string | undefined = body.recipient_email;

  quote.status = "Sent";
  quote.sent_at = new Date();
  await quote.save();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "send",
    record_type: "Quote",
    record_id: quote._id,
    new_value: recipientEmail || "sent",
    timestamp: new Date(),
  });

  await logSystemActivity({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    type: "Quote Sent",
    subject: `Quote Sent: ${quote.quote_number}`,
    description: recipientEmail ? `Sent to ${recipientEmail}` : undefined,
    linked_account_id: quote.account_id?.toString(),
    linked_opportunity_id: quote.opportunity_id?.toString()
  });

  return NextResponse.json({
    success: true,
    data: quote,
    message: recipientEmail
      ? `Quote sent to ${recipientEmail}`
      : "Quote marked as sent.",
  });
}

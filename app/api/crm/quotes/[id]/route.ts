import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmQuote from "@/models/crm/Quote";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmApprovalRequest from "@/models/crm/ApprovalRequest";
import { processQuoteApproval } from "@/lib/crm/approvalEngine";
import { requireRole } from "@/lib/crm/rbac";

type RouteProps = { params: Promise<{ id: string }> };

// ─── GET /api/crm/quotes/[id] ────────────────────────────────────────────────
export async function GET(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });
  requireRole(session, ['quote.view', 'quote.read']);

  await dbConnect();

  const quote = await CrmQuote.findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("account_id", "company_name billing_address phone email")
      .populate("opportunity_id", "deal_name amount stage")
      .populate("owner_id", "name email")
      .populate("approved_by_id", "name email").lean();

  if (!quote)
    return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

  // Fetch approval history for this quote
  const approvalHistory = await CrmApprovalRequest.find({
    linked_record_id: quote._id,
    tenantId: session.user.tenantId,
  })
    .populate("requested_by_id", "name email")
    .populate("approver_id", "name email")
    .sort({ createdAt: -1 })
    .lean();

  // Audit: view
  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "view",
    record_type: "Quote",
    record_id: quote._id,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true, data: { ...quote.toObject(), approvalHistory } });
}

// ─── PUT /api/crm/quotes/[id] ────────────────────────────────────────────────
export async function PUT(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ['quote.edit', 'quote.write']);
  if (roleCheck) return roleCheck;

  await dbConnect();

  const quote = await CrmQuote.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!quote)
    return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

  const body = await req.json();

  // Locked quote → create a new version instead of editing
  const LOCKED_STATUSES = ["Approved", "Sent", "Accepted"];
  if (LOCKED_STATUSES.includes(quote.status) && !body._force_edit) {
    // Create a new version
    const newQuote = new CrmQuote({
      ...quote.toObject(),
      _id: undefined,
      __v: undefined,
      status: "Draft",
      version: quote.version + 1,
      parent_quote_id: quote._id,
      quote_number: `${quote.quote_number}-V${quote.version + 1}`,
      sent_at: undefined,
      viewed_at: undefined,
      approved_by_id: undefined,
      createdBy: session.user.id,
      ...body,
    });
    await newQuote.save();

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "version_create",
      record_type: "Quote",
      record_id: newQuote._id,
      old_value: quote._id.toString(),
      new_value: `V${newQuote.version}`,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true, data: newQuote, versioned: true });
  }

  // Editable quote
  const editableFields = [
    "line_items",
    "validity_date",
    "terms_and_conditions",
    "notes",
    "discount_total",
    "tax_total",
    "grand_total",
    "owner_id",
  ];

  for (const field of editableFields) {
    if (body[field] !== undefined) {
      (quote as any)[field] = body[field];
    }
  }

  await quote.save();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "updated",
    record_type: "Quote",
    record_id: quote._id,
    timestamp: new Date(),
  });

  let approvalResult = null;
  if (body.submitForApproval) {
    approvalResult = await processQuoteApproval(quote, session.user.id);
  }

  return NextResponse.json({ success: true, data: quote, approvalResult });
}

// ─── DELETE /api/crm/quotes/[id] ─────────────────────────────────────────────
export async function DELETE(req: NextRequest, props: RouteProps) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ['quote.delete']);
  if (roleCheck) return roleCheck;

  await dbConnect();

  const quote = await CrmQuote.findOne({ _id: id, tenantId: session.user.tenantId });
  if (!quote)
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  if (["Approved", "Sent", "Accepted"].includes(quote.status)) {
    return NextResponse.json(
      { success: false, message: "Cannot delete an approved, sent, or accepted quote." },
      { status: 422 }
    );
  }

  await quote.deleteOne();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "deleted",
    record_type: "Quote",
    record_id: id,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true });
}

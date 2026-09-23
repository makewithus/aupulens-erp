import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmQuote from "@/models/crm/Quote";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmApprovalRequest from "@/models/crm/ApprovalRequest";
import { processQuoteApproval } from "@/lib/crm/approvalEngine";
import { logSystemActivity } from "@/lib/crm/activityLogger";
import { requireRole } from "@/lib/crm/rbac";
import { escapeRegex } from "@/lib/utils/regex";
import { safeHandler } from "@/lib/api/safeHandler";

// ─── GET /api/crm/quotes ─────────────────────────────────────────────────────
async function GET_handler(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['quote.view', 'quote.read']);

  const url = new URL(req.url);
  const account_id = url.searchParams.get("account_id");
  const opportunity_id = url.searchParams.get("opportunity_id");
  const owner_id = url.searchParams.get("owner_id");
  const status = url.searchParams.get("status");
  const search = url.searchParams.get("search");
  const validFrom = url.searchParams.get("validFrom");
  const validTo = url.searchParams.get("validTo");
  const minAmount = url.searchParams.get("minAmount");
  const maxAmount = url.searchParams.get("maxAmount");

  await dbConnect();

  const query: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (account_id) query.account_id = account_id;
  if (opportunity_id) query.opportunity_id = opportunity_id;
  if (owner_id) query.owner_id = owner_id;
  if (status) query.status = status;
  if (search) {
    query.quote_number = { $regex: escapeRegex(search), $options: "i" };
  }
  if (validFrom || validTo) {
    const validity_date: Record<string, Date> = {};
    if (validFrom) validity_date.$gte = new Date(validFrom);
    if (validTo) validity_date.$lte = new Date(validTo);
    query.validity_date = validity_date;
  }
  if (minAmount || maxAmount) {
    const grand_total: Record<string, number> = {};
    if (minAmount) grand_total.$gte = Number(minAmount);
    if (maxAmount) grand_total.$lte = Number(maxAmount);
    query.grand_total = grand_total;
  }

  const baseQuery = CrmQuote.find(query)
    .populate("account_id", "company_name billing_address")
    .populate("opportunity_id", "deal_name amount stage")
    .populate("owner_id", "name email")
    .sort({ createdAt: -1 });

  // Pagination is opt-in via `page` — the Account/Opportunity detail pages
  // and the filter-dropdown lookup on this same page read this list
  // unbounded (scoped by account_id/opportunity_id or for populating filter
  // options), so omitting `page` must keep returning everything.
  const pageParam = url.searchParams.get("page");
  if (!pageParam) {
    const quotes = await baseQuery.lean();
    return NextResponse.json({ success: true, data: { quotes, total: quotes.length, page: 1, totalPages: 1 } });
  }

  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25")));

  // Summary cards reflect every quote matching the filters, not just the
  // current page.
  const now = new Date();
  const [total, quotes, statsAgg] = await Promise.all([
    CrmQuote.countDocuments(query),
    baseQuery.skip((page - 1) * limit).limit(limit).lean(),
    CrmQuote.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalValue: { $sum: "$grand_total" },
          pending: { $sum: { $cond: [{ $eq: ["$status", "Pending Approval"] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ["$status", "Approved"] }, 1, 0] } },
          expired: { $sum: { $cond: [{ $and: [{ $ne: ["$validity_date", null] }, { $lt: ["$validity_date", now] }] }, 1, 0] } },
        },
      },
    ]),
  ]);
  const stats = {
    totalValue: statsAgg[0]?.totalValue || 0,
    pending: statsAgg[0]?.pending || 0,
    approved: statsAgg[0]?.approved || 0,
    expired: statsAgg[0]?.expired || 0,
  };

  return NextResponse.json({ success: true, data: { quotes, total, page, totalPages: Math.max(1, Math.ceil(total / limit)), stats } });
}

import CrmAccount from "@/models/crm/Account";
import CrmOpportunity from "@/models/crm/Opportunity";
import User from "@/models/auth/User";

// ─── POST /api/crm/quotes ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId)
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const roleCheck = requireRole(session, ['quote.create', 'quote.write']);
    if (roleCheck) return roleCheck;

    await dbConnect();
    
    // Ensure schemas are registered
    CrmAccount.init();
    CrmOpportunity.init();
    User.init();

    const body = await req.json();

    // Generate unique quote number if not provided
    const quote_number =
      body.quote_number ||
      `QT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
        .toString()
        .padStart(3, "0")}`;

    const quote = new CrmQuote({
      ...body,
      tenantId: session.user.tenantId,
      createdBy: session.user.id,
      owner_id: body.owner_id || session.user.id,
      status: "Draft",
      quote_number,
      version: 1,
    });

    await quote.save();

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: "created",
      record_type: "Quote",
      record_id: quote._id,
      new_value: quote_number,
      timestamp: new Date(),
    });

    await logSystemActivity({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      subject: `Quote Created: ${quote_number}`,
      linked_account_id: quote.account_id?.toString(),
      linked_opportunity_id: quote.opportunity_id?.toString()
    });

    let approvalResult = null;
    if (body.submitForApproval) {
      approvalResult = await processQuoteApproval(quote, session.user.id);
    }

    return NextResponse.json(
      { success: true, data: quote, approvalResult },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Quote POST Error:", error);
    
    // Parse Mongoose validation errors into a clean, human-readable string
    let message = error.message;
    if (error.name === 'ValidationError') {
      message = Object.values(error.errors)
        .map((e: any) => e.message.replace(/Path `(.*?)`/g, "Field '$1'"))
        .join(' | ');
    }
    
    return NextResponse.json(
      { success: false, message },
      { status: 400 } // Send 400 Bad Request for validation errors instead of 500
    );
  }
}

export const GET = safeHandler(GET_handler);

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmContract from "@/models/crm/Contract";
import CrmAuditLog from "@/models/crm/CrmAuditLog";

// ─── GET /api/crm/contracts ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);

  const query: Record<string, unknown> = { tenantId: session.user.tenantId };
  if (url.searchParams.get("status")) query.status = url.searchParams.get("status");
  if (url.searchParams.get("account_id")) query.account_id = url.searchParams.get("account_id");
  if (url.searchParams.get("owner_id")) query.owner_id = url.searchParams.get("owner_id");
  if (url.searchParams.get("churn_risk")) query.churn_risk = url.searchParams.get("churn_risk");
  if (url.searchParams.get("search")) {
    query.contract_number = { $regex: url.searchParams.get("search"), $options: "i" };
  }

  // Expiry window filter
  const expiryDays = url.searchParams.get("expiry_days");
  if (expiryDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + parseInt(expiryDays));
    query.end_date = { $lte: cutoff, $gte: new Date() };
    query.status = { $in: ["Active", "Renewal Due", "Expiring"] };
  }

  const baseQuery = CrmContract.find(query)
    .sort({ end_date: 1, createdAt: -1 })
    .populate("account_id", "company_name account_health_score status")
    .populate("owner_id", "name email")
    .populate("opportunity_id", "deal_name amount stage")
    .populate("quote_id", "quote_number grand_total");

  // Stats (summary cards) reflect every contract matching the current
  // filters — unaffected by pagination, so they don't undercount once the
  // table itself is paginated.
  const [statsAgg, activeCount, expiringCount] = await Promise.all([
    CrmContract.aggregate([
      { $match: query },
      { $group: { _id: null, totalValue: { $sum: "$contract_value" } } },
    ]),
    CrmContract.countDocuments({ ...query, status: "Active" }),
    CrmContract.countDocuments({ ...query, status: { $in: ["Renewal Due", "Expiring"] } }),
  ]);
  const stats = {
    totalValue: statsAgg[0]?.totalValue || 0,
    activeCount,
    expiringCount,
  };

  // Pagination is opt-in via `page` — omitting it keeps returning everything,
  // matching the convention used across the rest of this codebase.
  const pageParam = url.searchParams.get("page");
  if (!pageParam) {
    const contracts = await baseQuery.lean();
    return NextResponse.json({ success: true, data: { contracts, total: contracts.length, page: 1, totalPages: 1, stats } });
  }

  const page = Math.max(parseInt(pageParam), 1);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "25"), 100);
  const skip = (page - 1) * limit;

  const [total, contracts] = await Promise.all([
    CrmContract.countDocuments(query),
    baseQuery.skip(skip).limit(limit).lean(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      contracts,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats,
    },
  });
}

// ─── POST /api/crm/contracts ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const body = await req.json();

  // ── Validation ─────────────────────────────────────────────────────────────
  if (!body.account_id) {
    return NextResponse.json(
      { success: false, message: "account_id is required." },
      { status: 422 }
    );
  }

  if (!body.start_date || !body.end_date) {
    return NextResponse.json(
      { success: false, message: "start_date and end_date are required." },
      { status: 422 }
    );
  }

  if (new Date(body.end_date) <= new Date(body.start_date)) {
    return NextResponse.json(
      { success: false, message: "end_date must be after start_date." },
      { status: 422 }
    );
  }

  if (body.renewal_date && new Date(body.renewal_date) > new Date(body.end_date)) {
    return NextResponse.json(
      { success: false, message: "renewal_date cannot be after end_date." },
      { status: 422 }
    );
  }

  if (body.contract_value !== undefined && body.contract_value < 0) {
    return NextResponse.json(
      { success: false, message: "contract_value cannot be negative." },
      { status: 422 }
    );
  }

  // ── Auto-generate contract number if not provided ─────────────────────────
  const contract_number =
    body.contract_number ||
    `CTR-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")}`;

  const contract = await CrmContract.create({
    ...body,
    contract_number,
    tenantId: session.user.tenantId,
    createdBy: session.user.id,
    owner_id: body.owner_id || session.user.id,
    status: "Draft",
    renewal_status: "Not Started",
    reminder_90_sent: false,
    reminder_60_sent: false,
    reminder_30_sent: false,
    reminder_7_sent: false,
  });

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: "created",
    record_type: "Contract",
    record_id: contract._id,
    new_value: contract_number,
    timestamp: new Date(),
  });

  return NextResponse.json({ success: true, data: contract }, { status: 201 });
}

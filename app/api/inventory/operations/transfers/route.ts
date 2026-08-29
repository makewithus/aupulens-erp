import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StockTransfer from "@/models/inventory/StockTransfer";
import Customer from "@/models/sales/Customer";
import Product from "@/models/inventory/Product"; // Ensure model registration

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const searchParams = req.nextUrl.searchParams;
    const type = searchParams.get("type"); // 'incoming' or 'outgoing'
    const statusFilter = searchParams.get("status");
    const search = searchParams.get("search")?.trim();

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    await connectDB();

    const query: any = { tenantId };
    if (type) {
      query["header.operationType"] = type;
    }
    if (statusFilter && statusFilter !== "all") {
      query.status = statusFilter;
    }
    if (search) {
      const re = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      const matchingPartners = await Customer.find({ tenantId, "header.name": re }, { _id: 1 }).lean();
      query.$or = [
        { "header.name": re },
        { "header.partnerName": re },
        { "header.partnerId": { $in: matchingPartners.map((p) => p._id) } },
      ];
    }

    const baseQuery = StockTransfer.find(query)
      .populate("header.partnerId", "header.name contact_details.email")
      .populate(
        "operations_tab.productId",
        "header.name tab_general_information.default_code",
      )
      .populate("chatter.authorId", "name image")
      .sort({ createdAt: -1 });

    // Pagination is opt-in via `page` — the current single consumer set
    // (Deliveries/Receipts pages) may grow other unbounded readers later, so
    // this follows the same safe convention used everywhere else.
    const pageParam = searchParams.get("page");
    if (!pageParam) {
      const transfers = await baseQuery.lean();
      return NextResponse.json({ transfers, total: transfers.length, page: 1, totalPages: 1 });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    const [total, transfers] = await Promise.all([
      StockTransfer.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ transfers, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error: any) {
    console.error("Fetch Transfers Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    const body = await req.json();

    await connectDB();

    // Auto-generate name if not provided (Simplistic)
    if (!body.header.name) {
      const prefix =
        body.header.operationType === "incoming" ? "WH/IN/" : "WH/OUT/";
      const count = await StockTransfer.countDocuments({
        "header.operationType": body.header.operationType,
      });
      body.header.name = `${prefix}${String(count + 1).padStart(5, "0")}`;
    }

    const transfer = await StockTransfer.create({
      ...body,
      tenantId,
      chatter: [
        {
          authorId: session.user.id,
          body: "Created " + body.header.operationType,
          type: "notification",
        },
      ],
    });

    return NextResponse.json({ transfer }, { status: 201 });
  } catch (error: any) {
    console.error("Create Transfer Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

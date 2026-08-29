import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import { PRODUCTION_STATUS } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("productionStatus");
    const search = searchParams.get("search")?.trim();

    const query: any = { tenantId };
    if (statusFilter && statusFilter !== "all") {
      query.productionStatus = statusFilter;
    }
    if (search) {
      query["header.name"] = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    }

    const baseQuery = ManufacturingOrder.find(query)
      .populate(
        "header.productId",
        "header.name tab_general_information.default_code",
      )
      .populate("chatter.authorId", "name image")
      .sort({ createdAt: -1 });

    // Pagination is opt-in via `page` — the Manufacturing module's own pages
    // (app/manufacturing/manufacturing, app/manufacturing/dashboard) also
    // read this same route unbounded, so that default must be preserved.
    const pageParam = searchParams.get("page");
    if (!pageParam) {
      const orders = await baseQuery.lean();
      return NextResponse.json({ orders, total: orders.length, page: 1, totalPages: 1 });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    const [total, orders] = await Promise.all([
      ManufacturingOrder.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ orders, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error: any) {
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

    // Generate Name
    if (!body.header.name) {
      const count = await ManufacturingOrder.countDocuments({ tenantId });
      body.header.name = `WH/MO/${String(count + 1).padStart(5, "0")}`;
    }

    // Initialise Plan-to-Produce fields
    if (!body.productionStatus) {
      body.productionStatus = PRODUCTION_STATUS.DEMAND_FORECAST;
    }
    if (!body.reworkCount) {
      body.reworkCount = 0;
    }

    const order = await ManufacturingOrder.create({
      ...body,
      tenantId,
      chatter: [
        { authorId: session.user.id, body: "Created MO", type: "notification" },
      ],
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

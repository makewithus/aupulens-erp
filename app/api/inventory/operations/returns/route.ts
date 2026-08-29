import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import StockTransfer from "@/models/StockTransfer";
import Customer from "@/models/Customer";

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
    const search = searchParams.get("search")?.trim();

    // A return is identified by having a source document reference (e.g. WH/IN/...)
    // and usually an opposite operation type. For now, we filter by name starting with RET or having sourceDocument.
    const query: any = {
      tenantId,
      $or: [
        { "header.name": { $regex: /RET/i } },
        { "header.sourceDocument": { $exists: true, $ne: "" } },
      ],
    };

    if (search) {
      const re = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      const matchingPartners = await Customer.find({ tenantId, "header.name": re }, { _id: 1 }).lean();
      // Narrow the base "is a return" $or down further by search terms —
      // combine both conditions with $and so search doesn't undo the
      // return-identification filter above.
      query.$and = [
        { $or: query.$or },
        {
          $or: [
            { "header.name": re },
            { "header.sourceDocument": re },
            { "header.partnerId": { $in: matchingPartners.map((p) => p._id) } },
          ],
        },
      ];
      delete query.$or;
    }

    const baseQuery = StockTransfer.find(query)
      .populate("header.partnerId", "header.name contact_details.email")
      .populate(
        "operations_tab.productId",
        "header.name tab_general_information.default_code",
      )
      .sort({ createdAt: -1 });

    // Pagination is opt-in via `page` — Finance's returns page shares this
    // same route and also expects the full unbounded list by default.
    const pageParam = searchParams.get("page");
    if (!pageParam) {
      const items = await baseQuery.lean();
      return NextResponse.json({ items, total: items.length, page: 1, totalPages: 1 });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      StockTransfer.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
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

    // Auto-generate return name (WH/RET/00001)
    if (!body.header.name) {
      const prefix = "WH/RET/";
      const count = await StockTransfer.countDocuments({
        tenantId,
        "header.name": { $regex: /^WH\/RET\// },
      });
      body.header.name = `${prefix}${String(count + 1).padStart(5, "0")}`;
    }

    const transfer = await StockTransfer.create({
      ...body,
      tenantId,
      chatter: [
        {
          authorId: session.user.id,
          body: "Created Return Document",
          type: "notification",
        },
      ],
    });

    return NextResponse.json({ item: transfer }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

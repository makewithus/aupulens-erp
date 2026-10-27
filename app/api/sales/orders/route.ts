import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import "@/models/sales/Customer";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/api/serverCache";
import { applyDemoScope, getDemoCacheSegment } from "@/lib/auth/scopeFilter";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const statusKey = searchParams.get("status") || "all";
    const dateFromKey = searchParams.get("dateFrom") || "";
    const dateToKey = searchParams.get("dateTo") || "";

    const cacheKey = `sales-orders:${tenantId}:${page}:${limit}:${statusKey}:${dateFromKey}:${dateToKey}:${getDemoCacheSegment(session)}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
    const skip = (page - 1) * limit;

    const query: any = { tenantId };
    const status = searchParams.get("status");
    if (status) query.status = status;

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      query["header.dateOrder"] = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) query["header.dateOrder"].$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query["header.dateOrder"].$lte = end;
      }
      if (Object.keys(query["header.dateOrder"]).length === 0) delete query["header.dateOrder"];
    }

    await connectDB();
    const scopedQuery = applyDemoScope(session, query);
    const [total, items] = await Promise.all([
      SaleOrder.countDocuments(scopedQuery),
      SaleOrder.find(scopedQuery)
        .populate("header.partnerId", "header.name header.displayName header.companyName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const payload = { items, total, page, totalPages: Math.ceil(total / limit) };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error fetching sales orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "sales")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();

const body = stripProtectedFields(await request.json());

    // Validate required fields
    if (
      !body.header?.name ||
      !body.header?.partnerId ||
      !body.orderLines?.length
    ) {
      return NextResponse.json(
        { error: "Missing required fields: header.name, header.partnerId, orderLines" },
        { status: 400 },
      );
    }

    const order = await SaleOrder.create({
      tenantId,
      header: body.header,
      orderLines: body.orderLines,
      otherInfo: body.otherInfo,
      totals: body.totals,
      status: body.status || DOCUMENT_STATUS.DRAFT,
    });

    invalidateCache(`sales-orders:${tenantId}`);
    return NextResponse.json({ order }, { status: 201 });

  } catch (error) {
    console.error("Error creating sales order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

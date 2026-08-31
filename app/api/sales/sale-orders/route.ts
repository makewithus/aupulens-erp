export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import Customer from "@/models/sales/Customer";
import "@/models/inventory/Product";

import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

// Map client legacy status to DB DocumentStatus
function toDbStatus(status: string): string {
  if (status === "sale") return DOCUMENT_STATUS.APPROVED;
  if (status === "sent") return DOCUMENT_STATUS.PENDING_APPROVAL;
  if (status === "cancel") return DOCUMENT_STATUS.CANCELLED;
  if (status === "done") return DOCUMENT_STATUS.CLOSED;
  return status;
}

// Map DB DocumentStatus to client legacy status
function toClientStatus(status: string): string {
  if (status === DOCUMENT_STATUS.APPROVED) return "sale";
  if (status === DOCUMENT_STATUS.PENDING_APPROVAL) return "sent";
  if (status === DOCUMENT_STATUS.CANCELLED) return "cancel";
  if (status === DOCUMENT_STATUS.CLOSED) return "done";
  return status;
}

// Map order document fields to client structure
function mapOrderToClient(order: any): any {
  if (!order) return order;
  return {
    ...order,
    status: toClientStatus(order.status),
  };
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const q2cStatus = searchParams.get("q2cStatus");
    const partnerId = searchParams.get("partnerId");
    const search = (searchParams.get("search") || "").trim();
    const pageParam = searchParams.get("page");

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = session.user.tenantId;

    let query: any = { tenantId };

    if (status) {
      const statuses = status.split(",").map(toDbStatus);
      query.status = { $in: statuses };
    }

    if (q2cStatus) {
      const q2cStatuses = q2cStatus.split(",");
      query.q2cStatus = { $in: q2cStatuses };
    }

    if (partnerId) {
      query["header.partnerId"] = partnerId;
    }

    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query["header.dateOrder"] = range;
    }

    if (search) {
      const re = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      const matchingPartners = await Customer.find({ tenantId, "header.name": re }, { _id: 1 }).lean();
      query.$or = [
        { "header.name": re },
        { "header.partnerId": { $in: matchingPartners.map((p) => p._id) } },
      ];
    }

    const baseQuery = SaleOrder.find(query)
      .populate("header.partnerId", "header.name")
      .populate("orderLines.productId", "header.name")
      .sort({ createdAt: -1 });

    if (!pageParam) {
      // Backward-compat: no ?page= → return everything, unpaginated. The Q2C
      // Pipeline board (app/sales/pipeline/page.tsx) needs every order across
      // every stage at once to render its kanban columns, so this path must
      // keep returning the full result set exactly as before.
      const orders = await baseQuery.lean();
      const clientOrders = orders.map(mapOrderToClient);
      return NextResponse.json({ items: clientOrders });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const skip = (page - 1) * limit;

    const [total, orders] = await Promise.all([
      SaleOrder.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    const clientOrders = orders.map(mapOrderToClient);
    return NextResponse.json({ items: clientOrders, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error("Error fetching sale orders:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();
    const body = await request.json();

    if (body.status) {
      body.status = toDbStatus(body.status);
    }

    // Auto-set order date if confirming to sale order
    if (body.status === DOCUMENT_STATUS.APPROVED) {
      if (body.header) {
        body.header.dateOrder = new Date();
      } else {
        body["header.dateOrder"] = new Date();
      }
    }

    if (!body.header?.name || !body.header?.partnerId) {
      return NextResponse.json(
        { error: "Order name and partner are required" },
        { status: 400 },
      );
    }

    const order = await SaleOrder.create({
      ...body,
      tenantId,
    });

    const clientOrder = mapOrderToClient(order.toObject());
    return NextResponse.json({ order: clientOrder }, { status: 201 });
  } catch (error) {
    console.error("Error creating sale order:", error);
    if ((error as any).code === 11000) {
      return NextResponse.json(
        { error: "Order name already exists in this tenant" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

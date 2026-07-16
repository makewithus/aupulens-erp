export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";
import "@/models/Customer";
import "@/models/Product";

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

    await connectDB();
    const tenantId = session.user.tenantId || "default-tenant";

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

    const orders = await SaleOrder.find(query)
      .populate("header.partnerId", "header.name")
      .populate("orderLines.productId", "header.name")
      .sort({ createdAt: -1 })
      .lean();

    const clientOrders = orders.map(mapOrderToClient);
    return NextResponse.json({ items: clientOrders });
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

    const tenantId = (session.user as any).tenantId || "default-tenant";
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

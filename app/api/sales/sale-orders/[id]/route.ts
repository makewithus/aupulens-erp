export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import "@/models/sales/Customer";
import "@/models/inventory/Product";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { transitionDeal, DealError } from "@/lib/sales/pipelineDeals";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const order = await SaleOrder.findOne({
      _id: id,
      tenantId,
    })
      .populate("header.partnerId")
      .populate("orderLines.productId")
      .lean();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ item: mapOrderToClient(order) });
  } catch (error) {
    console.error("Error fetching sale order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    // Backward-compatible mapping from legacy sale-order statuses.
    if (body.status) {
      body.status = toDbStatus(body.status);
    }

    // Check if confirming to sale order.
    if (body.status === DOCUMENT_STATUS.APPROVED) {
      if (body.header) {
        body.header.dateOrder = new Date();
      } else {
        body["header.dateOrder"] = new Date();
      }
    }

    // ── Q2C transition: delegated to the shared pipeline engine so the
    // document reference, linked quote and auto-generated invoice all stay in
    // step no matter which UI triggers the move.
    if (body.q2cStatus) {
      try {
        await transitionDeal({ tenantId, userId: session.user.id, kind: "order", id, to: body.q2cStatus });
      } catch (e: any) {
        if (e instanceof DealError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
      }
      delete body.q2cStatus;
      if (Object.keys(body).length === 0) {
        const updated = await SaleOrder.findOne({ _id: id, tenantId }).lean();
        return NextResponse.json({ order: mapOrderToClient(updated) });
      }
    }

    const order = await SaleOrder.findOneAndUpdate(
      {
        _id: id,
        tenantId,
      },
      { $set: body },
      { new: true, runValidators: true },
    );

    if (!order) {
      return NextResponse.json(
        { error: "Order not found or access denied" },
        { status: 404 },
      );
    }

    const clientOrder = mapOrderToClient(order.toObject());
    return NextResponse.json({ order: clientOrder });
  } catch (error) {
    console.error("Error updating sale order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const order = await SaleOrder.findOneAndDelete({
      _id: id,
      tenantId,
      status: { $in: [DOCUMENT_STATUS.DRAFT, DOCUMENT_STATUS.CANCELLED] }, // Only allow deleting drafts or cancelled ones
    });

    if (!order) {
      return NextResponse.json(
        {
          error: "Order not found, access denied, or status prevented deletion",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting sale order:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

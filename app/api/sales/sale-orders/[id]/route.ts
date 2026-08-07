export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";
import "@/models/Customer";
import "@/models/Product";
import {
  DOCUMENT_STATUS,
  Q2C_STATUS,
  isValidQ2CTransition,
} from "@/lib/constants/statuses";

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

    // ── Q2C transition validation ──
    if (body.q2cStatus) {
      const existing = await SaleOrder.findOne({ _id: id, tenantId }).lean();
      if (!existing) {
        return NextResponse.json(
          { error: "Order not found" },
          { status: 404 },
        );
      }

      const currentQ2C = (existing as any).q2cStatus || Q2C_STATUS.LEAD;
      if (!isValidQ2CTransition(currentQ2C, body.q2cStatus)) {
        return NextResponse.json(
          {
            error: `Invalid Q2C transition from "${currentQ2C}" to "${body.q2cStatus}"`,
          },
          { status: 400 },
        );
      }

      // Auto-sync document status based on Q2C stage
      if (
        body.q2cStatus === Q2C_STATUS.QUOTE_GENERATED &&
        !body.status
      ) {
        body.status = DOCUMENT_STATUS.PENDING_APPROVAL;
      }
      if (
        body.q2cStatus === Q2C_STATUS.SALES_ORDER &&
        !body.status
      ) {
        body.status = DOCUMENT_STATUS.APPROVED;
        if (body.header) {
          body.header.dateOrder = new Date();
        } else {
          body["header.dateOrder"] = new Date();
        }
      }
      if (
        body.q2cStatus === Q2C_STATUS.CANCELLED &&
        !body.status
      ) {
        body.status = DOCUMENT_STATUS.CANCELLED;
      }

      // Discount approval timestamps
      if (body.q2cStatus === Q2C_STATUS.DISCOUNT_APPROVAL) {
        body["discountApproval.required"] = true;
      }
      if (
        body.q2cStatus === Q2C_STATUS.QUOTE_ACCEPTED &&
        currentQ2C === Q2C_STATUS.DISCOUNT_APPROVAL
      ) {
        body["discountApproval.approvedAt"] = new Date();
        body["discountApproval.approvedBy"] = session.user.id;
      }

      // Fulfillment timestamp
      if (body.q2cStatus === Q2C_STATUS.FULFILLMENT) {
        body["fulfillment.triggeredAt"] = new Date();
        body["fulfillment.triggeredBy"] = session.user.id;
      }

      // Revenue recognition timestamp
      if (body.q2cStatus === Q2C_STATUS.REVENUE_RECOGNIZED) {
        body["revenueRecognition.recognizedAt"] = new Date();
        body["revenueRecognition.recognizedBy"] = session.user.id;
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

import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const order = await PurchaseOrder.findOne({ _id: id, tenantId })
      .populate("partnerId", "header.name contact_details.email address_tab")
      .populate("orderLines.productId", "header.name tab_general_information")
      .lean();

    if (!order) {
      return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });
    }

    return NextResponse.json({ item: order });
  } catch (error: any) {
    console.error("Error fetching purchase order detail:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();
    await connectDB();

    const existing = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!existing) {
      return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });
    }

    // Don't allow edits on closed/cancelled/posted orders unless specifically changing state
    if (existing.status === DOCUMENT_STATUS.POSTED && body.status !== DOCUMENT_STATUS.CANCELLED) {
      return NextResponse.json(
        { error: "Approved or Posted Purchase Orders cannot be modified" },
        { status: 400 },
      );
    }

    // Recalculate totals if orderLines change
    if (body.orderLines) {
      const amountUntaxed = body.orderLines.reduce((sum: number, line: any) => {
        const lineQty = Number(line.productQty) || 0;
        const linePrice = Number(line.priceUnit) || 0;
        const lineSubtotal = Number((lineQty * linePrice).toFixed(2));
        line.priceSubtotal = lineSubtotal;
        return sum + lineSubtotal;
      }, 0);

      body.totals = {
        amountUntaxed,
        amountTax: Number((amountUntaxed * 0.18).toFixed(2)),
        amountTotal: Number((amountUntaxed * 1.18).toFixed(2)),
      };
    }

    const order = await PurchaseOrder.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true }
    )
      .populate("partnerId", "header.name contact_details.email")
      .populate("orderLines.productId", "header.name");

    return NextResponse.json({ item: order });
  } catch (error: any) {
    console.error("Error updating purchase order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const existing = await PurchaseOrder.findOne({ _id: id, tenantId });
    if (!existing) {
      return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });
    }

    if (existing.status !== DOCUMENT_STATUS.DRAFT && existing.status !== DOCUMENT_STATUS.CANCELLED) {
      return NextResponse.json(
        { error: "Only draft or cancelled purchase orders can be deleted" },
        { status: 400 },
      );
    }

    await PurchaseOrder.findOneAndDelete({ _id: id, tenantId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting purchase order:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

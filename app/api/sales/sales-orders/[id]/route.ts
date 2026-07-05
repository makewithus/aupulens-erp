import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";
import { SALES_ORDER_STATUS_VALUES, SALES_ORDER_SHIPMENT_STATUS_VALUES } from "@/lib/constants/statuses";
import "@/models/Customer";
import "@/models/User";
import "@/models/SalesInvoice";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const { id } = await params;
    const order = await (SaleOrder as any)
      .findOne({ _id: id, tenantId: session.user.tenantId })
      .populate("header.partnerId", "header contact_details")
      .populate("otherInfo.salespersonId", "name email")
      .populate("salesInvoiceIds", "number status totalAmount")
      .lean();

    if (!order) {
      return NextResponse.json({ success: false, message: "Sales order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error: any) {
    console.error("Sales Order GET error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Handles the small set of real lifecycle transitions the Zoho-style tab
// exposes (confirm / hold / void / close, shipment status updates).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;
    const body = await request.json();

    const update: Record<string, any> = {};
    if (body.salesOrderStatus !== undefined) {
      if (!SALES_ORDER_STATUS_VALUES.includes(body.salesOrderStatus)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      update.salesOrderStatus = body.salesOrderStatus;
    }
    if (body.shipmentStatus !== undefined) {
      if (!SALES_ORDER_SHIPMENT_STATUS_VALUES.includes(body.shipmentStatus)) {
        return NextResponse.json({ success: false, message: "Invalid shipment status" }, { status: 400 });
      }
      update.shipmentStatus = body.shipmentStatus;
    }
    if (body.customerViewed !== undefined) update.customerViewed = !!body.customerViewed;

    const order = await SaleOrder.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true });
    if (!order) {
      return NextResponse.json({ success: false, message: "Sales order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: order });
  } catch (error: any) {
    console.error("Sales Order PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

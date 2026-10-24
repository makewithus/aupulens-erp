import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import InventoryItem from "@/models/inventory/InventoryItem";
import {
  SALES_ORDER_STATUS,
  SALES_ORDER_STATUS_VALUES,
  SALES_ORDER_SHIPMENT_STATUS_VALUES,
  STOCK_LEVEL_STATUS,
  Q2C_STATUS,
  DOCUMENT_STATUS,
} from "@/lib/constants/statuses";
import "@/models/sales/Customer";
import "@/models/auth/User";
import "@/models/sales/SalesInvoice";

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

    const currentOrder = await SaleOrder.findOne({ _id: id, tenantId });
    if (!currentOrder) {
      return NextResponse.json({ success: false, message: "Sales order not found" }, { status: 404 });
    }

    const update: Record<string, any> = {};
    if (body.salesOrderStatus !== undefined) {
      if (!SALES_ORDER_STATUS_VALUES.includes(body.salesOrderStatus)) {
        return NextResponse.json({ success: false, message: "Invalid status" }, { status: 400 });
      }
      update.salesOrderStatus = body.salesOrderStatus;
      if (body.salesOrderStatus === SALES_ORDER_STATUS.VOID || body.salesOrderStatus === "cancelled") {
        update.q2cStatus = Q2C_STATUS.CANCELLED;
        update.status = DOCUMENT_STATUS.CANCELLED;
      } else if (body.salesOrderStatus === SALES_ORDER_STATUS.CLOSED) {
        if (currentOrder.q2cStatus !== Q2C_STATUS.INVOICE_POSTED && currentOrder.q2cStatus !== Q2C_STATUS.REVENUE_RECOGNIZED) {
          update.q2cStatus = Q2C_STATUS.REVENUE_RECOGNIZED;
        }
        update.status = DOCUMENT_STATUS.CLOSED;
      } else if (body.salesOrderStatus === SALES_ORDER_STATUS.CONFIRMED) {
        if (currentOrder.q2cStatus === Q2C_STATUS.CANCELLED || currentOrder.q2cStatus === Q2C_STATUS.LOST) {
          update.q2cStatus = Q2C_STATUS.SALES_ORDER;
        }
        update.status = DOCUMENT_STATUS.APPROVED;
      }
    }
    if (body.shipmentStatus !== undefined) {
      if (!SALES_ORDER_SHIPMENT_STATUS_VALUES.includes(body.shipmentStatus)) {
        return NextResponse.json({ success: false, message: "Invalid shipment status" }, { status: 400 });
      }
      update.shipmentStatus = body.shipmentStatus;

      if (body.shipmentStatus === "shipped" && currentOrder.shipmentStatus !== "shipped") {
        for (const line of (currentOrder as any).orderLines || []) {
          const qty = Number(line.productQty) || 0;
          if (qty <= 0) continue;
          const itemName = line.name || line.productName;
          const itemCode = line.itemCode;
          const item = await InventoryItem.findOne({
            tenantId,
            $or: [
              ...(itemCode ? [{ itemCode }] : []),
              ...(itemName ? [{ name: itemName }, { itemCode: itemName }] : []),
            ],
          });
          if (item) {
            const newQty = Math.max(0, item.quantity - qty);
            const newTotalVal = Math.max(0, item.totalValue - qty * (item.unitCost || 0));
            item.quantity = newQty;
            item.totalValue = newTotalVal;
            if (newQty === 0) item.status = STOCK_LEVEL_STATUS.OUT_OF_STOCK;
            else if (newQty <= (item.reorderLevel || 0)) item.status = STOCK_LEVEL_STATUS.LOW_STOCK;
            await item.save();
          }
        }
      }
    }
    if (body.customerViewed !== undefined) update.customerViewed = !!body.customerViewed;

    const order = await SaleOrder.findOneAndUpdate({ _id: id, tenantId }, { $set: update }, { new: true });
    return NextResponse.json({ success: true, data: order });
  } catch (error: any) {
    console.error("Sales Order PATCH error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/SaleOrder";
import { SalesInvoice } from "@/models/SalesInvoice";
import { generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";
import { SALES_ORDER_INVOICING_STATUS } from "@/lib/constants/statuses";

// Mirrors app/api/sales/quotes/[id]/convert-to-invoice's shape — creates a
// real SalesInvoice (the same entity Subscriptions/Quotes convert into) and
// marks the order invoiced. A second attempt is rejected with 409 rather
// than silently double-invoicing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;

    const order = await SaleOrder.findOne({ _id: id, tenantId });
    if (!order) return NextResponse.json({ success: false, message: "Sales order not found" }, { status: 404 });
    if (order.invoicingStatus === SALES_ORDER_INVOICING_STATUS.INVOICED) {
      return NextResponse.json({ success: false, message: "This sales order has already been invoiced" }, { status: 409 });
    }

    const { number } = await generateInvoiceNumber(tenantId);

    const invoice = new SalesInvoice({
      tenantId,
      number,
      customerId: order.header.partnerId,
      reference: order.otherInfo?.clientOrderRef,
      lineItems: order.orderLines.map((line) => ({
        itemId: line.productId,
        name: line.name,
        qty: line.productQty,
        unitPrice: line.priceUnit,
        discount: line.discount,
        discountMode: "percent",
        taxRate: order.taxMode !== "none" ? order.taxRate || 0 : 0,
        lineTotal: line.priceSubtotal,
      })),
      extraDiscount: order.extraDiscount || 0,
      taxableAmount: order.subTotal || order.totals.amountUntaxed,
      totalDiscount: 0,
      totalAmount: order.totals.amountTotal,
      taxes: {
        tds: order.taxMode === "tds" ? order.taxRate || 0 : 0,
        tcs: order.taxMode === "tcs" ? order.taxRate || 0 : 0,
        gstBreakup: [],
      },
      notes: order.customerNotes,
      terms: order.termsAndConditions,
      createdBy: session.user.id,
    });
    await invoice.save();

    order.invoicingStatus = SALES_ORDER_INVOICING_STATUS.INVOICED;
    order.salesInvoiceIds = [...(order.salesInvoiceIds || []), invoice._id as any];
    await order.save();

    return NextResponse.json({ success: true, data: { order, invoice } }, { status: 201 });
  } catch (error: any) {
    console.error("Sales Order convert-to-invoice error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

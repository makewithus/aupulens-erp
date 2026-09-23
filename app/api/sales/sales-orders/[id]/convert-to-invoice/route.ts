import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SaleOrder from "@/models/sales/SaleOrder";
import { Q2C_STATUS, SALES_ORDER_INVOICING_STATUS } from "@/lib/constants/statuses";
import { createInvoiceForOrder, DealError } from "@/lib/sales/pipelineDeals";

// Creates the real, GL-posted SalesInvoice for a sales order through the same
// path the Q2C pipeline's "Invoice Posted" stage uses, so tax/discount lines
// carry over exactly and the pipeline card moves with it. A second attempt is
// rejected with 409 rather than silently double-invoicing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;

    const order: any = await SaleOrder.findOne({ _id: id, tenantId });
    if (!order) return NextResponse.json({ success: false, message: "Sales order not found" }, { status: 404 });
    if (order.invoicingStatus === SALES_ORDER_INVOICING_STATUS.INVOICED || (order.salesInvoiceIds || []).length > 0) {
      return NextResponse.json({ success: false, message: "This sales order has already been invoiced." }, { status: 409 });
    }

    const invoice = await createInvoiceForOrder({ tenantId, userId: session.user.id, order });
    order.q2cStatus = Q2C_STATUS.INVOICE_POSTED;
    await order.save();

    return NextResponse.json({ success: true, data: { order, invoice } }, { status: 201 });
  } catch (error: any) {
    if (error instanceof DealError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Sales Order convert-to-invoice error:", error);
    return NextResponse.json(
      { success: false, message: "We couldn't create the invoice for this order. Please try again." },
      { status: 500 },
    );
  }
}

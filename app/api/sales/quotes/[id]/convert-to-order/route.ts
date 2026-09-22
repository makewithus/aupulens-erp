import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { createOrderFromQuote, DealError } from "@/lib/sales/pipelineDeals";

// Moves a quote to a Sales Order (Quote -> Sales Order, the order is created
// *after* the quote). The same deal then continues on the Q2C pipeline.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    await connectDB();
    const tenantId = session.user.tenantId;
    const { id } = await params;

    const quote = await SalesQuotation.findOne({ _id: id, tenantId });
    if (!quote) return NextResponse.json({ success: false, message: "Quote not found" }, { status: 404 });

    const order = await createOrderFromQuote({ tenantId, userId: session.user.id, quote });
    return NextResponse.json({ success: true, data: { quote, order } }, { status: 201 });
  } catch (error: any) {
    if (error instanceof DealError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Quote convert-to-order error:", error);
    return NextResponse.json(
      { success: false, message: "We couldn't create the sales order from this quote. Please try again." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SalesQuotation from "@/models/sales/SalesQuotation";
import { convertQuoteToInvoice, QuoteInvoiceError } from "@/lib/sales/quoteInvoice";
import { syncSaleOrderOnQuoteConverted } from "@/lib/sales/q2cSync";

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

    const invoice = await convertQuoteToInvoice({ tenantId, userId: session.user.id, quote });

    // Advances the Q2C Pipeline board — best-effort: a failure here is a
    // cosmetic pipeline-visibility issue, not a reason to fail (or roll
    // back) a real quote-to-invoice conversion that already succeeded.
    try {
      await syncSaleOrderOnQuoteConverted({ tenantId, quote, invoice });
    } catch (syncError) {
      console.error("Q2C pipeline sync error (non-fatal):", syncError);
    }

    return NextResponse.json({ success: true, data: { quote, invoice } }, { status: 201 });
  } catch (error: any) {
    if (error instanceof QuoteInvoiceError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    }
    console.error("Quote convert-to-invoice error:", error);
    return NextResponse.json(
      { success: false, message: "We couldn't convert this quote to an invoice. Please try again." },
      { status: 500 },
    );
  }
}

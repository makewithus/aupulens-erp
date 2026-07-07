import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SalesQuotation from "@/models/SalesQuotation";
import { SalesInvoice } from "@/models/SalesInvoice";
import { generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";
import { QUOTE_STATUS } from "@/lib/constants/statuses";

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
    if (quote.convertedInvoiceId) {
      return NextResponse.json({ success: false, message: "This quote has already been invoiced" }, { status: 409 });
    }

    const { number } = await generateInvoiceNumber(tenantId);

    const invoice = new SalesInvoice({
      tenantId,
      number,
      customerId: quote.customerId,
      reference: quote.reference,
      lineItems: quote.lineItems,
      itemLevelDiscountPercent: quote.itemLevelDiscountPercent,
      extraDiscount: quote.extraDiscount,
      extraDiscountMode: quote.extraDiscountMode,
      taxableAmount: quote.taxableAmount,
      totalDiscount: quote.totalDiscount,
      totalAmount: quote.totalAmount,
      taxes: {
        tds: quote.taxes?.mode === "tds" ? quote.taxes.rate : 0,
        tcs: quote.taxes?.mode === "tcs" ? quote.taxes.rate : 0,
        gstBreakup: [],
      },
      notes: quote.customerNotes,
      terms: quote.terms,
      createdBy: session.user.id,
    });
    await invoice.save();

    quote.status = QUOTE_STATUS.INVOICED;
    quote.convertedInvoiceId = invoice._id as any;
    await quote.save();

    return NextResponse.json({ success: true, data: { quote, invoice } }, { status: 201 });
  } catch (error: any) {
    console.error("Quote convert-to-invoice error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

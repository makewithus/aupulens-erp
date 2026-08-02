import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import SalesQuotation from "@/models/SalesQuotation";
import { SalesInvoice } from "@/models/SalesInvoice";
import { generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";
import { QUOTE_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { postSalesInvoiceJournal } from "@/lib/accounting/salesInvoicePosting";

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

    const tdsRate = quote.taxes?.mode === "tds" ? quote.taxes.rate : 0;
    const tcsRate = quote.taxes?.mode === "tcs" ? quote.taxes.rate : 0;
    // Recomputed rather than copying the quote's own totals verbatim —
    // the quote model has no gstBreakup/totalTax/tcsAmount/tdsAmount fields
    // of its own (only the mode/rate), so this is the only way to get the
    // precise monetary breakdown needed to post the invoice to the GL.
    // Matches the discount type/value exactly (Issue #7), just recomputed.
    const totals = computeInvoiceTotals({
      lineItems: quote.lineItems as any,
      itemLevelDiscountPercent: quote.itemLevelDiscountPercent,
      extraDiscount: quote.extraDiscount,
      extraDiscountMode: quote.extraDiscountMode,
      tdsRate,
      tcsRate,
    });

    // SalesQuotation.lineItems[].lineTotal has `default: 0`, so a quote's
    // own lineTotal is silently 0 for every line (never actually computed —
    // same root gap as the invoice form, just masked there by the default
    // instead of failing validation). Copying quote.lineItems verbatim would
    // carry that 0 straight onto the invoice. Recompute from totals instead.
    const lineItemsWithTotals = (quote.lineItems as any[]).map((li, i) => ({
      ...(li as any),
      lineTotal: totals.computedLines[i]?.lineTotal ?? 0,
    }));

    const invoice = new SalesInvoice({
      tenantId,
      number,
      customerId: quote.customerId,
      reference: quote.reference,
      lineItems: lineItemsWithTotals,
      itemLevelDiscountPercent: quote.itemLevelDiscountPercent,
      extraDiscount: quote.extraDiscount,
      extraDiscountMode: quote.extraDiscountMode,
      taxableAmount: totals.taxableAmount,
      totalDiscount: totals.totalDiscount,
      totalAmount: totals.totalAmount,
      taxes: {
        tds: tdsRate,
        tcs: tcsRate,
        gstBreakup: totals.gstBreakup,
      },
      status: SALES_INVOICE_STATUS.SAVED,
      notes: quote.customerNotes,
      terms: quote.terms,
      createdBy: session.user.id,
    });

    try {
      await postSalesInvoiceJournal({
        invoice,
        tenantId,
        createdBy: session.user.id,
        current: { taxableAmount: totals.taxableAmount, totalTax: totals.totalTax, tcsAmount: totals.tcsAmount, tdsAmount: totals.tdsAmount },
      });
    } catch (postingError: any) {
      return NextResponse.json({ success: false, message: postingError.message }, { status: 400 });
    }
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

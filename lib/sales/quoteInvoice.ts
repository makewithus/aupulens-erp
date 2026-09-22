import SalesQuotation from "@/models/sales/SalesQuotation";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";
import { QUOTE_STATUS, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { postSalesInvoiceJournal } from "@/lib/accounting/salesInvoicePosting";

export class QuoteInvoiceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Turns a quote into a posted sales invoice. Shared by the Quotes page
 * ("Convert to Invoice") and the Q2C pipeline ("Invoice Posted" stage) so both
 * paths produce the exact same invoice, GL entry and totals.
 *
 * Caller must have already called connectDB(). Does NOT touch the pipeline
 * board — callers run their own sync afterwards.
 */
export async function convertQuoteToInvoice(params: {
  tenantId: string;
  userId: string;
  quote: any;
}) {
  const { tenantId, userId, quote } = params;
  if (quote.convertedInvoiceId) {
    throw new QuoteInvoiceError("This quote has already been invoiced.", 409);
  }

  const { number } = await generateInvoiceNumber(tenantId);

  const tdsRate = quote.taxes?.mode === "tds" ? quote.taxes.rate : 0;
  const tcsRate = quote.taxes?.mode === "tcs" ? quote.taxes.rate : 0;
  const adjustment = Number(quote.adjustment) || 0;
  // The quote's manual adjustment is part of its total but the invoice model
  // has no adjustment field — carry it as a non-taxable additional charge so
  // the invoice total matches the quote instead of silently drifting.
  const additionalCharges = adjustment ? [{ name: "Adjustment", amount: adjustment, isTaxable: false }] : [];

  const totals = computeInvoiceTotals({
    lineItems: quote.lineItems as any,
    itemLevelDiscountPercent: quote.itemLevelDiscountPercent,
    extraDiscount: quote.extraDiscount,
    extraDiscountMode: quote.extraDiscountMode,
    additionalCharges,
    tdsRate,
    tcsRate,
  });

  // Quote line totals default to 0 and are never computed on the quote itself;
  // recompute so the invoice lines carry real totals.
  const lineItemsWithTotals = (quote.lineItems as any[]).map((li, i) => ({
    ...(li.toObject ? li.toObject() : li),
    lineTotal: totals.computedLines[i]?.lineTotal ?? 0,
  }));

  const invoice = new SalesInvoice({
    tenantId,
    number,
    customerId: quote.customerId,
    reference: quote.reference,
    lineItems: lineItemsWithTotals,
    itemLevelDiscountPercent: quote.itemLevelDiscountPercent,
    additionalCharges,
    extraDiscount: quote.extraDiscount,
    extraDiscountMode: quote.extraDiscountMode,
    taxableAmount: totals.taxableAmount,
    totalDiscount: totals.totalDiscount,
    totalAmount: totals.totalAmount,
    taxes: { tds: tdsRate, tcs: tcsRate, gstBreakup: totals.gstBreakup },
    status: SALES_INVOICE_STATUS.SAVED,
    notes: quote.customerNotes,
    terms: quote.terms,
    createdBy: userId,
  });

  try {
    await postSalesInvoiceJournal({
      invoice,
      tenantId,
      createdBy: userId,
      current: {
        taxableAmount: totals.taxableAmount,
        totalTax: totals.totalTax,
        tcsAmount: totals.tcsAmount,
        tdsAmount: totals.tdsAmount,
      },
    });
  } catch (postingError: any) {
    throw new QuoteInvoiceError(postingError.message, 400);
  }
  await invoice.save();

  quote.status = QUOTE_STATUS.INVOICED;
  quote.convertedInvoiceId = invoice._id as any;
  await quote.save();

  return invoice;
}

export async function findQuote(tenantId: string, id: string) {
  return SalesQuotation.findOne({ _id: id, tenantId });
}

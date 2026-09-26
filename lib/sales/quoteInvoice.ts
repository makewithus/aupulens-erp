import Organization from "@/models/admin/Organization";
import Customer from "@/models/sales/Customer";
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

  // Atomically lock the quote to prevent double-click race conditions from
  // creating duplicate identical invoices.
  const lockedQuote = await SalesQuotation.findOneAndUpdate(
    { _id: quote._id, tenantId, convertedInvoiceId: null, $or: [{ isConverting: { $ne: true } }, { conversionStartedAt: { $lt: new Date(Date.now() - 120000) } }] },
    { $set: { isConverting: true, conversionStartedAt: new Date() } },
  );

  if (!lockedQuote) {
    throw new QuoteInvoiceError("This quote is already being invoiced or has been invoiced.", 409);
  }

  try {
    const [org, customer] = await Promise.all([
      Organization.findOne({ subdomain: tenantId }).lean(),
      Customer.findOne({ _id: quote.customerId, tenantId }).lean(),
    ]);
    const sellerState = org?.settings?.state;
    const placeOfSupply = (quote as any).placeOfSupply || (customer as any)?.address_tab?.state_name;
    let invoice = await SalesInvoice.findOne({ tenantId, sourceQuoteId: quote._id });
    const number = invoice?.number || (await generateInvoiceNumber(tenantId)).number;

  const tdsRate = quote.taxes?.mode === "tds" ? quote.taxes.rate : 0;
  const tcsRate = quote.taxes?.mode === "tcs" ? quote.taxes.rate : 0;
  const adjustment = Number(quote.adjustment) || 0;
  // The quote's manual adjustment is part of its total but the invoice model
  // has no adjustment field — carry it as a non-taxable additional charge so
  // the invoice total matches the quote instead of silently drifting.
  const additionalCharges = adjustment ? [{ name: "Adjustment", amount: adjustment, isTaxable: false }] : [];

  const totals = computeInvoiceTotals({
    sellerState, placeOfSupply,
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

  invoice = invoice || new SalesInvoice({
    sourceQuoteId: quote._id,
    placeOfSupply,
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
    status: SALES_INVOICE_STATUS.DRAFT,
    notes: quote.customerNotes,
    terms: quote.terms,
    createdBy: userId,
  });

  await invoice.save();
  try {
    await postSalesInvoiceJournal({
      invoice,
      tenantId,
      createdBy: userId,
      idempotencyKey: `Q2C/${quote._id}`,
      current: {
        taxableAmount: totals.taxableAmount,
        totalTax: totals.totalTax,
        tcsAmount: totals.tcsAmount,
        tdsAmount: totals.tdsAmount,
        cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst,
      },
    });
  } catch (postingError: any) {
    throw new QuoteInvoiceError(postingError.message, 400);
  }
  invoice.status = SALES_INVOICE_STATUS.SAVED;
  await invoice.save();

  quote.status = QUOTE_STATUS.INVOICED;
  quote.convertedInvoiceId = invoice._id as any;
  quote.isConverting = false;
  await quote.save();

  return invoice;
  } catch (err: any) {
    await SalesQuotation.updateOne({ _id: quote._id, tenantId }, { $set: { isConverting: false } });
    throw err;
  }
}

export async function findQuote(tenantId: string, id: string) {
  return SalesQuotation.findOne({ _id: id, tenantId });
}

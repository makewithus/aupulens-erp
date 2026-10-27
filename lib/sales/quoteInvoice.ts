import { getAccountingSession, withAccountingTransaction } from "@/lib/accounting/transaction";
import mongoose from "mongoose";
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
 *
 * Requires a transaction-capable MongoDB deployment. All writes share the
 * surrounding accounting transaction; there is no partial-write fallback.
 */
export async function convertQuoteToInvoice(params: {
  tenantId: string;
  userId: string;
  quote: any;
}) {
  return withAccountingTransaction(async () => {
    const { tenantId, userId } = params;
    // Reload inside each transaction attempt; a retry must not reuse a document
    // mutated by another request or by an aborted attempt.
    const quote = await SalesQuotation.findOne({ _id: params.quote._id, tenantId });
    if (!quote) throw new QuoteInvoiceError("Quote not found.", 404);
    if (quote.convertedInvoiceId) {
      const existing = await SalesInvoice.findOne({ _id: quote.convertedInvoiceId, tenantId });
      if (existing) return existing;
      throw new QuoteInvoiceError("This quote has already been invoiced.", 409);
    }

    // Atomically lock the quote to prevent double-click race conditions from
    // creating duplicate identical invoices.
    const lockedQuote = await SalesQuotation.findOneAndUpdate(
      { _id: quote._id, tenantId, convertedInvoiceId: null, $or: [{ isConverting: { $ne: true } }, { conversionStartedAt: { $lt: new Date(Date.now() - 120000) } }] },
      { $set: { isConverting: true, conversionStartedAt: new Date() } },
      { new: true },
    );

    if (!lockedQuote) {
      throw new QuoteInvoiceError("This quote is already being invoiced or has been invoiced.", 409);
    }

    const dbSession = getAccountingSession();
    let invoice: any = null;
    try {
      const org = await Organization.findOne({ subdomain: tenantId }).session(dbSession || null).lean();
      const customer = await Customer.findOne({ _id: quote.customerId, tenantId }).session(dbSession || null).lean();
      const sellerState = org?.settings?.state;
      const placeOfSupply = (quote as any).placeOfSupply || (customer as any)?.address_tab?.state_name;
      invoice = await SalesInvoice.findOne({ tenantId, sourceQuoteId: quote._id }).session(dbSession || null);
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

      if (!invoice) {
        invoice = new SalesInvoice({
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
      } else {
        invoice.placeOfSupply = placeOfSupply;
        invoice.lineItems = lineItemsWithTotals;
        invoice.additionalCharges = additionalCharges;
        invoice.taxableAmount = totals.taxableAmount;
        invoice.totalDiscount = totals.totalDiscount;
        invoice.totalAmount = totals.totalAmount;
        invoice.taxes = { tds: tdsRate, tcs: tcsRate, gstBreakup: totals.gstBreakup };
      }

      await invoice.save({ session: dbSession || undefined });

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
      await invoice.save({ session: dbSession || undefined });

      quote.status = QUOTE_STATUS.INVOICED;
      quote.convertedInvoiceId = invoice._id as any;
      quote.isConverting = false;
      await quote.save({ session: dbSession || undefined });

      return invoice;
    } catch (err: any) {
      // Compensating action: unlock quote and clean up any uncommitted draft invoice
      try {
        await SalesQuotation.updateOne(
          { _id: quote._id, tenantId },
          { $set: { isConverting: false }, $unset: { conversionStartedAt: "" } }
        );
        if (invoice?._id) {
          await SalesInvoice.deleteOne({ _id: invoice._id, tenantId });
        }
      } catch {
        // Ignore cleanup failure so primary error propagates
      }
      throw err;
    }
  });
}

export async function findQuote(tenantId: string, id: string) {
  return SalesQuotation.findOne({ _id: id, tenantId });
}

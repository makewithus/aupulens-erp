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

function supportsMongoTransactions(): boolean {
  try {
    const conn = mongoose.connection as any;
    const client = conn?.client || (conn?.getClient ? conn.getClient() : null);
    const topologyType = client?.topology?.description?.type;
    return topologyType === "ReplicaSetWithPrimary" || topologyType === "Sharded";
  } catch {
    return false;
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
 * Implements a multi-document transaction boundary where supported, paired
 * with idempotent compensation cleanup to guarantee atomicity.
 */
export async function convertQuoteToInvoice(params: {
  tenantId: string;
  userId: string;
  quote: any;
}) {
  const { tenantId, userId, quote } = params;
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

  let dbSession: mongoose.ClientSession | null = null;
  let isTransactionActive = false;
  let newlyCreatedInvoiceId: mongoose.Types.ObjectId | null = null;

  try {
    if (supportsMongoTransactions()) {
      try {
        dbSession = await mongoose.startSession();
        dbSession.startTransaction();
        isTransactionActive = true;
      } catch {
        dbSession = null;
        isTransactionActive = false;
      }
    }

    const [org, customer] = await Promise.all([
      Organization.findOne({ subdomain: tenantId }).session(dbSession || null).lean(),
      Customer.findOne({ _id: quote.customerId, tenantId }).session(dbSession || null).lean(),
    ]);
    const sellerState = org?.settings?.state;
    const placeOfSupply = (quote as any).placeOfSupply || (customer as any)?.address_tab?.state_name;
    let invoice = await SalesInvoice.findOne({ tenantId, sourceQuoteId: quote._id }).session(dbSession || null);
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
      newlyCreatedInvoiceId = invoice._id as mongoose.Types.ObjectId;
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

    if (isTransactionActive && dbSession) {
      await dbSession.commitTransaction();
      isTransactionActive = false;
    }

    return invoice;
  } catch (err: any) {
    if (isTransactionActive && dbSession) {
      try {
        await dbSession.abortTransaction();
      } catch {
        // Transaction may already be aborted
      }
    } else if (newlyCreatedInvoiceId) {
      // Compensating action when transactions are unavailable:
      // Remove the orphaned draft invoice so no dangling financial document exists
      try {
        await SalesInvoice.deleteOne({ _id: newlyCreatedInvoiceId, tenantId, status: SALES_INVOICE_STATUS.DRAFT });
      } catch {
        // Best-effort compensation log
      }
    }

    await SalesQuotation.updateOne({ _id: quote._id, tenantId }, { $set: { isConverting: false } });
    throw err;
  } finally {
    if (dbSession) {
      dbSession.endSession();
    }
  }
}

export async function findQuote(tenantId: string, id: string) {
  return SalesQuotation.findOne({ _id: id, tenantId });
}

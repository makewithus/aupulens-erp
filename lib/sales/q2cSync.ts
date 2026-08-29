import SaleOrder from "@/models/sales/SaleOrder";
import { DOCUMENT_STATUS, Q2C_STATUS } from "@/lib/constants/statuses";

// The Q2C Pipeline board (app/sales/pipeline/page.tsx) reads exclusively
// from the SaleOrder collection's q2cStatus field, but nothing in the real
// Quotes -> Invoices -> Payments workflow this app actually drives ever
// created or updated a SaleOrder — that only happened via the pipeline
// board's own manual "move to next stage" buttons, which QA never touched.
// So every real quote/invoice/payment a user creates was invisible to the
// board, which looked permanently frozen ("Q2C pipeline doesn't work, no
// update"). These two functions wire the pipeline to the events that
// actually happen elsewhere in Sales, without touching the manual
// transition buttons (still available for anyone who wants to track a deal
// through the earlier Lead/Opportunity/Discount-Approval stages by hand).
//
// Caller must have already called connectDB().

/**
 * Upserts (or advances) the pipeline card for a quote the instant it's
 * converted to an invoice — the point at which "Quote Accepted", "Sales
 * Order", and "Invoice Posted" have all genuinely happened in one atomic
 * step in this app's actual UI (there's no separate "create sales order"
 * screen in the real workflow to represent those as distinct events).
 * Upserts by { tenantId, header.name: quote.quoteNumber } — a quote can
 * only ever be converted once (guarded by quote.convertedInvoiceId in the
 * caller), so that name is stable and satisfies SaleOrder's own
 * { tenantId, header.name } unique index.
 */
export async function syncSaleOrderOnQuoteConverted(params: {
  tenantId: string;
  quote: any;
  invoice: any;
}): Promise<void> {
  const { tenantId, quote, invoice } = params;

  const orderLines = (quote.lineItems || []).map((li: any) => ({
    name: li.name,
    productQty: Number(li.qty) || 1,
    priceUnit: Number(li.unitPrice) || 0,
    discount: Number(li.discount) || 0,
    priceSubtotal: (Number(li.qty) || 1) * (Number(li.unitPrice) || 0),
  }));

  await (SaleOrder as any).findOneAndUpdate(
    { tenantId, "header.name": quote.quoteNumber },
    {
      $setOnInsert: {
        tenantId,
        header: { name: quote.quoteNumber, partnerId: quote.customerId, dateOrder: quote.quoteDate || new Date() },
        orderLines,
        status: DOCUMENT_STATUS.POSTED,
      },
      $set: {
        totals: {
          amountUntaxed: quote.taxableAmount || quote.totalAmount || 0,
          amountTax: 0,
          amountTotal: quote.totalAmount || 0,
        },
        q2cStatus: Q2C_STATUS.INVOICE_POSTED,
        salesInvoiceIds: [invoice._id],
      },
    },
    { upsert: true },
  );
}

/**
 * Advances a linked pipeline card to "Revenue Recognized" once its invoice
 * is fully paid — mirrors the same event any Record Payment / "Mark as
 * fully paid" action already produces on the invoice itself.
 */
export async function advanceSaleOrderOnInvoicePaid(tenantId: string, invoiceId: any): Promise<void> {
  await (SaleOrder as any).updateMany(
    { tenantId, salesInvoiceIds: invoiceId, q2cStatus: { $ne: Q2C_STATUS.REVENUE_RECOGNIZED } },
    { $set: { q2cStatus: Q2C_STATUS.REVENUE_RECOGNIZED } },
  );
}

import { SALES_INVOICE_STATUS as S } from "@/lib/constants/statuses";

/** Issued sales value (including tax), not cash receipts or GL net revenue. */
export const ISSUED_INVOICE_STATUSES = [S.SAVED, S.PARTIALLY_PAID, S.PAID, S.OVERDUE];
export const issuedInvoiceFilter = () => ({ status: { $in: [...ISSUED_INVOICE_STATUSES] } });
/** Authoritative sales revenue excluding GST collected on behalf of the tax authority. */
export const invoiceRevenueExpression = {
  $cond: [
    { $gt: [{ $ifNull: ["$taxableAmount", 0] }, 0] },
    "$taxableAmount",
    {
      $max: [
        0,
        {
          $subtract: [
            { $ifNull: ["$totalAmount", 0] },
            {
              $sum: {
                $map: {
                  input: { $ifNull: ["$taxes.gstBreakup", []] },
                  as: "g",
                  in: { $ifNull: ["$$g.amount", 0] },
                },
              },
            },
          ],
        },
      ],
    },
  ],
};
export const invoiceGrossValueExpression = { $ifNull: ["$totalAmount", 0] };

/** Runtime equivalent of invoiceRevenueExpression for an already loaded invoice. */
export function invoiceRevenueFromDocument(invoice: {
  taxableAmount?: number | null;
  totalAmount?: number | null;
  taxes?: { gstBreakup?: Array<{ amount?: number | null }> | null } | null;
}): number {
  const taxable = Number(invoice.taxableAmount);
  if (Number.isFinite(taxable) && taxable > 0) return taxable;
  const gst = (invoice.taxes?.gstBreakup || []).reduce(
    (sum, tax) => sum + (Number(tax.amount) || 0),
    0,
  );
  return Math.max(0, (Number(invoice.totalAmount) || 0) - gst);
}

export const invoicePaidAmountExpression = {
  $cond: [
    { $gt: [{ $size: { $ifNull: ["$payments", []] } }, 0] },
    {
      $sum: {
        $map: {
          input: { $ifNull: ["$payments", []] },
          as: "p",
          in: { $ifNull: ["$$p.amount", 0] },
        },
      },
    },
    { $ifNull: ["$paidAmount", 0] },
  ],
};

export const invoiceOutstandingExpression = {
  $max: [
    0,
    {
      $subtract: [
        { $ifNull: ["$totalAmount", 0] },
        invoicePaidAmountExpression,
      ],
    },
  ],
};

export function unpaidInvoiceFilter(now?: Date) {
  let dateFilter = {};
  if (now) {
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    dateFilter = { dueDate: { $lt: startOfToday } };
  }
  return {
    status: { $in: [S.SAVED, S.PARTIALLY_PAID, S.OVERDUE] },
    markedFullyPaid: { $ne: true },
    $expr: { $gt: [invoiceOutstandingExpression, 0] },
    ...dateFilter,
  };
}

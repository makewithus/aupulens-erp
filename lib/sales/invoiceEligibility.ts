import { SALES_INVOICE_STATUS as S } from "@/lib/constants/statuses";

/** Issued sales value (including tax), not cash receipts or GL net revenue. */
export const ISSUED_INVOICE_STATUSES = [S.SAVED, S.PARTIALLY_PAID, S.PAID, S.OVERDUE];
export const issuedInvoiceFilter = () => ({ status: { $in: [...ISSUED_INVOICE_STATUSES] } });
export const invoicePaidAmountExpression = { $sum: { $map: { input: { $ifNull: ["$payments", []] }, as: "payment", in: { $ifNull: ["$$payment.amount", 0] } } } };
export const invoiceOutstandingExpression = { $cond: [{ $eq: ["$markedFullyPaid", true] }, 0, { $max: [0, { $subtract: ["$totalAmount", invoicePaidAmountExpression] }] }] };
export function unpaidInvoiceFilter(now?: Date) {
  return {
    status: { $in: [S.SAVED, S.PARTIALLY_PAID, S.OVERDUE] },
    markedFullyPaid: { $ne: true },
    $expr: { $gt: [invoiceOutstandingExpression, 0] },
    ...(now ? { dueDate: { $lt: now } } : {}),
  };
}

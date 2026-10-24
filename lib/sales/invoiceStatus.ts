import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

export interface StatusResolutionInput {
  requestedStatus: string;
  totalAmount: number;
  payments?: { amount: number }[];
  markedFullyPaid?: boolean;
  dueDate?: Date | string;
}

/**
 * Server-side status resolution: payment state and due date always win over a
 * client-supplied status (except explicit cancel/draft), so the list/detail
 * views can never show "saved" on an overdue or fully-paid invoice or vice versa.
 *
 * Accepts an optional deterministic `now` parameter for testing.
 */
export function resolveInvoiceStatus(input: StatusResolutionInput, now: Date | string = new Date()): string {
  const { requestedStatus, totalAmount, payments = [], markedFullyPaid, dueDate } = input;

  if (requestedStatus === SALES_INVOICE_STATUS.DRAFT || requestedStatus === SALES_INVOICE_STATUS.CANCELLED) {
    return requestedStatus;
  }

  const paidSum = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  if (markedFullyPaid || (totalAmount > 0 && paidSum >= totalAmount)) {
    return SALES_INVOICE_STATUS.PAID;
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  const isPastDue = !!(dueDate && !isNaN(new Date(dueDate).getTime()) && new Date(dueDate).getTime() < nowDate.getTime());

  if (isPastDue) {
    return SALES_INVOICE_STATUS.OVERDUE;
  }

  if (paidSum > 0) {
    return SALES_INVOICE_STATUS.PARTIALLY_PAID;
  }

  return SALES_INVOICE_STATUS.SAVED;
}

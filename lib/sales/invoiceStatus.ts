import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

export interface StatusResolutionInput {
  requestedStatus: string;
  totalAmount: number;
  payments?: { amount: number }[];
  markedFullyPaid?: boolean;
  dueDate?: Date | string;
}

/**
 * Server-side status resolution: payment state always wins over a
 * client-supplied status (except explicit cancel/draft), so the list/detail
 * views can never show "saved" on a fully-paid invoice or vice versa.
 */
export function resolveInvoiceStatus(input: StatusResolutionInput): string {
  const { requestedStatus, totalAmount, payments = [], markedFullyPaid, dueDate } = input;

  if (requestedStatus === SALES_INVOICE_STATUS.DRAFT || requestedStatus === SALES_INVOICE_STATUS.CANCELLED) {
    return requestedStatus;
  }

  const paidSum = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  if (markedFullyPaid || (totalAmount > 0 && paidSum >= totalAmount)) {
    return SALES_INVOICE_STATUS.PAID;
  }
  if (paidSum > 0) {
    return SALES_INVOICE_STATUS.PARTIALLY_PAID;
  }
  if (dueDate && new Date(dueDate).getTime() < Date.now()) {
    return SALES_INVOICE_STATUS.OVERDUE;
  }
  return SALES_INVOICE_STATUS.SAVED;
}

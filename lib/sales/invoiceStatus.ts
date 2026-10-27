import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

export interface StatusResolutionInput {
  requestedStatus: string;
  totalAmount: number;
  payments?: { amount: number }[];
  markedFullyPaid?: boolean;
  dueDate?: Date | string;
}

/**
 * Determines whether an invoice is overdue based on dueDate and the current time (now).
 * An invoice is only overdue AFTER its due date has passed (i.e. strictly after 23:59:59.999
 * of the due date), never on the due date itself.
 */
export function isInvoiceOverdue(dueDate: Date | string | undefined | null, now: Date | string = new Date()): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (isNaN(d.getTime())) return false;
  const nowDate = now instanceof Date ? now : new Date(now);

  let dueYear: number;
  let dueMonth: number;
  let dueDay: number;

  if (typeof dueDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(dueDate)) {
    const parts = dueDate.split("T")[0].split("-").map(Number);
    dueYear = parts[0];
    dueMonth = parts[1] - 1;
    dueDay = parts[2];
  } else {
    dueYear = d.getFullYear();
    dueMonth = d.getMonth();
    dueDay = d.getDate();
  }

  const dueEndOfDayLocal = new Date(dueYear, dueMonth, dueDay, 23, 59, 59, 999).getTime();
  const dueEndOfDayUtc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)).getTime();
  const effectiveDueEnd = Math.max(dueEndOfDayLocal, dueEndOfDayUtc);

  return nowDate.getTime() > effectiveDueEnd;
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
  const isPastDue = isInvoiceOverdue(dueDate, nowDate);

  if (isPastDue) {
    return SALES_INVOICE_STATUS.OVERDUE;
  }

  if (paidSum > 0) {
    return SALES_INVOICE_STATUS.PARTIALLY_PAID;
  }

  return SALES_INVOICE_STATUS.SAVED;
}


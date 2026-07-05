import { startOfWeek, endOfWeek, subWeeks, addWeeks, addDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { SalesInvoice } from "@/models/SalesInvoice";
import { SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { buildMongoFilterFromCriteria } from "@/lib/sales/subscriptionViews";

export { buildMongoFilterFromCriteria };

const UNPAID_STATUSES = [SALES_INVOICE_STATUS.SAVED, SALES_INVOICE_STATUS.PARTIALLY_PAID, SALES_INVOICE_STATUS.OVERDUE];

// Server-only: resolves the specialFilter views that need "now"-relative date
// windows or a cross-collection SalesInvoice lookup, neither of which the
// generic criteria interpreter can express. Mirrors customerViews.server.ts's
// resolveSpecialFilter shape/pattern.
export async function resolveSpecialFilter(
  specialFilter: string,
  tenantId: string,
): Promise<Record<string, any>> {
  const now = new Date();

  switch (specialFilter) {
    case "trial_expired_prev_week": {
      const start = startOfWeek(subWeeks(now, 1));
      const end = endOfWeek(subWeeks(now, 1));
      return { trialEndsAt: { $gte: start, $lte: end } };
    }
    case "trial_expiring_next_week": {
      const start = startOfWeek(addWeeks(now, 1));
      const end = endOfWeek(addWeeks(now, 1));
      return { trialEndsAt: { $gte: start, $lte: end } };
    }
    case "trial_expiring_next_7_days": {
      return { trialEndsAt: { $gte: now, $lte: addDays(now, 7) } };
    }
    case "unpaid_invoices": {
      const invoiceIds = await (SalesInvoice as any).distinct("_id", { tenantId, status: { $in: UNPAID_STATUSES } });
      return { generatedInvoiceIds: { $in: invoiceIds } };
    }
    case "pending_invoices": {
      const invoiceIds = await (SalesInvoice as any).distinct("_id", {
        tenantId,
        status: SALES_INVOICE_STATUS.SAVED,
      });
      return { generatedInvoiceIds: { $in: invoiceIds } };
    }
    case "canceled_this_month": {
      return { status: "cancelled", cancelledAt: { $gte: startOfMonth(now), $lte: endOfMonth(now) } };
    }
    case "canceled_last_month": {
      const lastMonth = subMonths(now, 1);
      return { status: "cancelled", cancelledAt: { $gte: startOfMonth(lastMonth), $lte: endOfMonth(lastMonth) } };
    }
    case "expiring_this_month": {
      return { neverExpires: false, expiresOn: { $gte: startOfMonth(now), $lte: endOfMonth(now) } };
    }
    case "for_items": {
      return { lineItems: { $elemMatch: { itemId: { $exists: true, $ne: null } } } };
    }
    default:
      return {};
  }
}

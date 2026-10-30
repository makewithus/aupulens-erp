import { DOCUMENT_STATUS, SALES_ORDER_STATUS } from "@/lib/constants/statuses";

/**
 * Matches a real, confirmed order regardless of which sales UI created it.
 * Keep analytics and summaries on this shared predicate so chart totals agree
 * with the order KPI and order list semantics.
 */
export const REAL_ORDER_MATCH = {
  $or: [
    {
      salesOrderStatus: {
        $in: [SALES_ORDER_STATUS.APPROVED, SALES_ORDER_STATUS.CONFIRMED, SALES_ORDER_STATUS.CLOSED],
      },
    },
    { status: { $in: [DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.CLOSED] } },
    // Legacy Odoo values remain in old rows although the current schema no
    // longer permits writing them.
    { status: { $in: ["sale", "done"] } },
  ],
};

/** Tenant-scoped definition used by confirmed-order summaries and AI context. */
export const realOrderFilter = (tenantId: string) => ({ tenantId, ...REAL_ORDER_MATCH });

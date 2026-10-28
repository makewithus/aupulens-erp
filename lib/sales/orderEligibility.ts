import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * Matches a real, confirmed order regardless of which sales UI created it.
 * Keep analytics and summaries on this shared predicate so chart totals agree
 * with the order KPI and order list semantics.
 */
export const REAL_ORDER_MATCH = {
  $or: [
    { salesOrderStatus: { $ne: null } },
    { status: { $in: [DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.POSTED, DOCUMENT_STATUS.CLOSED] } },
    // Legacy Odoo values remain in old rows although the current schema no
    // longer permits writing them.
    { status: { $in: ["sale", "done"] } },
  ],
};

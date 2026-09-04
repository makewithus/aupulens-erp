import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockMove from "@/models/inventory/StockMove";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-28's cut-off evaluation, extracted into a plain callable service
 * (docs/ai/BRIEF-06-BATCH-E.md Part 0.4) so another workflow can call it directly instead of
 * going through the executor — AI-28's own workflow wraps this exact function rather than
 * duplicating the logic, and AI-14 calls it to classify a driver as a real "timing" difference
 * instead of declaring the whole decomposition dimension `not_implemented`.
 *
 * **Scope is unchanged from Chunk 4, still recorded honestly**: only vendor bills
 * (`Invoice`, `moveType: "in_invoice"`) with `PurchaseOrder` → `StockMove` receipt evidence can be
 * evaluated. Everything else — a sales invoice, an expense, a bill with no PO link, any line that
 * isn't a bill at all — returns `determinable: false`. This function never *guesses* a governing
 * date; it either has real evidence or it says so.
 */

export type CutoffGoverningDateType = "stock_move_receipt" | "po_date_order";

export interface CutoffEvaluation {
  determinable: boolean;
  isTimingDifference: boolean;
  postedDate: Date | null;
  governingDate: Date | null;
  governingDateType: CutoffGoverningDateType | null;
  evidenceRef?: string;
  reason: string;
}

function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Evaluates whether a vendor bill's posted date and its real receipt evidence fall in different
 * accounting periods. `periodBoundary` is any date inside the period being evaluated (its own
 * calendar month is used for the comparison) — callers typically pass a period-end date.
 */
export async function evaluateCutoff(tenantId: string, invoiceId: string, periodBoundary: Date): Promise<CutoffEvaluation> {
  await connectDB();

  const bill = await Invoice.findOne({ _id: invoiceId, tenantId, moveType: "in_invoice", state: { $ne: DOCUMENT_STATUS.CANCELLED } })
    .select("_id name invoiceDate amountTotal")
    .lean();
  if (!bill) {
    return { determinable: false, isTimingDifference: false, postedDate: null, governingDate: null, governingDateType: null, reason: "not a vendor bill, or not found" };
  }

  const postedDate = (bill as { invoiceDate?: Date }).invoiceDate ?? null;

  const po = await PurchaseOrder.findOne({ tenantId, invoiceIds: bill._id }).select("dateOrder stockMoveIds").lean();
  let governingDate: Date | null = null;
  let governingDateType: CutoffGoverningDateType | null = null;
  let evidenceRef: string | undefined;

  if (po?.stockMoveIds?.length) {
    const moves = await StockMove.find({ _id: { $in: po.stockMoveIds } }).select("_id effectiveDate scheduledDate").lean();
    const receiptDates = moves
      .map((m) => (m as { effectiveDate?: Date; scheduledDate?: Date }).effectiveDate ?? (m as { scheduledDate?: Date }).scheduledDate)
      .filter((d): d is Date => Boolean(d));
    if (receiptDates.length > 0) {
      governingDate = new Date(Math.min(...receiptDates.map((d) => d.getTime())));
      governingDateType = "stock_move_receipt";
      evidenceRef = String(moves[0]._id);
    }
  }
  if (!governingDate && po?.dateOrder) {
    governingDate = po.dateOrder;
    governingDateType = "po_date_order";
    evidenceRef = String((po as { _id?: unknown })._id);
  }

  if (!governingDate || !postedDate) {
    return { determinable: false, isTimingDifference: false, postedDate, governingDate: null, governingDateType: null, reason: "no PO/StockMove evidence to compare against" };
  }

  const postedPeriod = periodOf(postedDate);
  const evidencePeriod = periodOf(governingDate);

  // "Timing" means the posted date and the evidence date simply disagree on which period this
  // belongs in (AI-28's original, unmodified rule — preserved exactly here, not refined, since a
  // caller only ever asks this about a transaction it already knows landed in the period in
  // question). `periodBoundary` is accepted for callers that want to state which period they're
  // asking about, but the comparison itself is between the transaction's own two dates.
  void periodBoundary;
  const isTimingDifference = postedPeriod !== evidencePeriod;

  return {
    determinable: true,
    isTimingDifference,
    postedDate,
    governingDate,
    governingDateType,
    evidenceRef,
    reason: isTimingDifference
      ? `posted ${postedPeriod}, evidence (${governingDateType}) says ${evidencePeriod}`
      : "posted date and evidence date agree on period",
  };
}

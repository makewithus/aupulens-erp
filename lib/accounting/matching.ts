import PurchaseOrder, { type IPurchaseOrderLine } from "@/models/finance/PurchaseOrder";
import Invoice, { type IInvoiceLine } from "@/models/finance/Invoice";
import StockMove from "@/models/inventory/StockMove";
import StockTransfer from "@/models/inventory/StockTransfer";
import mongoose from "mongoose";

/**
 * AI-06 (docs/ai/BRIEF-05-BATCH-D.md) — a pure, additive extension of this file's existing
 * matching logic: `runPOMatching()` already decides match/mismatch and already checks the
 * receipt leg for `poMatchType: "3_way"` (both confirmed present, not missing, before this
 * function was added — the actual gap was that a mismatch only ever produced a terse boolean
 * verdict + a hand-written text note, never a structured "which leg, by how much"). This function
 * computes that structure from the same two documents `runPOMatching()` already reads, without
 * calling or altering it in any way — `runPOMatching()`'s own callers and behaviour are
 * completely unaffected by this export existing.
 */
/** `reference` is the PO's quantity/price for the `quantity`/`price` legs, and the received
 *  quantity (from goods-receipt stock moves) for the `receipt` leg — one shared shape for all
 *  three, since each is structurally the same "billed vs what it should be" comparison. */
export interface MatchLegVariance {
  billed: number;
  reference: number;
  variance: number;
  withinTolerance: boolean;
}
export interface LineMatchResult {
  productId: string;
  name: string;
  quantity: MatchLegVariance;
  price: MatchLegVariance;
  receipt?: MatchLegVariance; // only when poMatchType is "3_way"
  verdict: "match" | "exception";
}

/** No PO line found for this invoice line at all — its own, unambiguous verdict, kept separate
 *  from a computed variance so a caller never mistakes "nothing to compare" for "compared and
 *  fine." */
export interface UnmatchedLine {
  productId: string;
  name: string;
  verdict: "no_po_line";
}

const DEFAULT_TOLERANCE_PCT = 0.01; // 1% — a documented heuristic (no tolerance field exists anywhere in this codebase to consult), applied uniformly to quantity, price, and receipt legs.

function legVariance(billed: number, reference: number, tolerancePct: number): MatchLegVariance {
  const variance = Math.round((billed - reference) * 100) / 100;
  const withinTolerance = reference === 0 ? billed === 0 : Math.abs(variance) / Math.abs(reference) <= tolerancePct;
  return { billed, reference, variance, withinTolerance };
}

export function computeLineVariances(
  invoiceLines: IInvoiceLine[],
  poLines: IPurchaseOrderLine[],
  poMatchType: "2_way" | "3_way" | undefined,
  tolerancePct: number = DEFAULT_TOLERANCE_PCT,
): (LineMatchResult | UnmatchedLine)[] {
  return invoiceLines.map((invLine): LineMatchResult | UnmatchedLine => {
    const poLine = poLines.find((l) => String(l.productId) === String(invLine.productId));
    if (!poLine) {
      return { productId: String(invLine.productId), name: invLine.name, verdict: "no_po_line" };
    }

    const quantity = legVariance(invLine.quantity, poLine.productQty, tolerancePct);
    const price = legVariance(invLine.priceUnit, poLine.priceUnit, tolerancePct);
    const receipt = poMatchType === "3_way" ? legVariance(invLine.quantity, poLine.receivedQty, tolerancePct) : undefined;

    const verdict: "match" | "exception" =
      quantity.withinTolerance && price.withinTolerance && (!receipt || receipt.withinTolerance) ? "match" : "exception";

    return { productId: String(invLine.productId), name: invLine.name, quantity, price, receipt, verdict };
  });
}

export async function runPOMatching(invoiceId: string, tenantId: string) {
  const invoice = await Invoice.findOne({ _id: invoiceId, tenantId });
  if (!invoice) {
    throw new Error("Invoice not found");
  }

  // Only match vendor bills (in_invoice)
  if (invoice.moveType !== "in_invoice") {
    return;
  }

  const poRef = invoice.poReference?.trim();
  if (!poRef) {
    invoice.poMatchStatus = "pending";
    await invoice.save();
    return;
  }

  // Find the Purchase Order
  const po = await PurchaseOrder.findOne({ name: poRef, tenantId });
  if (!po) {
    invoice.poMatchStatus = "mismatch";
    invoice.manualReviewRequired = true;
    invoice.discrepancyNotes = `Purchase Order with reference "${poRef}" was not found.`;
    await invoice.save();
    return;
  }

  // Link Invoice to PO if not already linked
  if (!po.invoiceIds) po.invoiceIds = [];
  if (!po.invoiceIds.some((id) => id.toString() === invoice._id.toString())) {
    po.invoiceIds.push(invoice._id as mongoose.Types.ObjectId);
  }

  let isMatch = true;
  const discrepancies: string[] = [];

  // Match line items
  for (const invLine of invoice.invoiceLines) {
    // Find matching line in PO by productId
    const poLine = po.orderLines.find(
      (line) => line.productId.toString() === invLine.productId.toString()
    );

    if (!poLine) {
      isMatch = false;
      discrepancies.push(`Product ID ${invLine.productId} (${invLine.name}) not found in PO lines.`);
      continue;
    }

    // 1. Price Matching (Checking for price discrepancies)
    if (invLine.priceUnit > poLine.priceUnit) {
      isMatch = false;
      discrepancies.push(
        `Price mismatch for "${invLine.name}": Billed price (${invLine.priceUnit}) exceeds PO price (${poLine.priceUnit}).`
      );
    }

    // 2. Quantity Matching (2-Way)
    if (invLine.quantity > poLine.productQty) {
      isMatch = false;
      discrepancies.push(
        `Quantity mismatch for "${invLine.name}": Billed quantity (${invLine.quantity}) exceeds PO quantity (${poLine.productQty}).`
      );
    }

    // 3. Goods Receipt matching (3-Way)
    if (invoice.poMatchType === "3_way") {
      // Billed quantity cannot exceed received quantity from stock moves
      if (invLine.quantity > poLine.receivedQty) {
        isMatch = false;
        discrepancies.push(
          `3-Way Matching failure for "${invLine.name}": Billed quantity (${invLine.quantity}) exceeds received quantity (${poLine.receivedQty}) from Goods Receipts.`
        );
      }
    }
  }

  // Update PO line billed quantities if matched
  if (isMatch) {
    for (const invLine of invoice.invoiceLines) {
      const poLine = po.orderLines.find(
        (line) => line.productId.toString() === invLine.productId.toString()
      );
      if (poLine) {
        poLine.billedQty = (poLine.billedQty || 0) + invLine.quantity;
      }
    }
    invoice.poMatchStatus = "matched";
    invoice.manualReviewRequired = false;
    invoice.discrepancyNotes = "";
  } else {
    invoice.poMatchStatus = "mismatch";
    invoice.manualReviewRequired = true;
    invoice.discrepancyNotes = discrepancies.join("\n");
  }

  await invoice.save();
  await po.save();

  return {
    poMatchStatus: invoice.poMatchStatus,
    manualReviewRequired: invoice.manualReviewRequired,
    discrepancyNotes: invoice.discrepancyNotes,
  };
}

export async function matchStockMoveToPO(stockMoveId: string, tenantId: string) {
  const stockMove = await StockMove.findOne({ _id: stockMoveId, tenantId });
  if (!stockMove || stockMove.moveType !== "incoming") {
    return;
  }

  const poRef = stockMove.sourceDocument?.trim();
  if (!poRef) return;

  const po = await PurchaseOrder.findOne({ name: poRef, tenantId });
  if (!po) return;

  // Link StockMove to PO if not already linked
  if (!po.stockMoveIds) po.stockMoveIds = [];
  if (!po.stockMoveIds.some((id) => id.toString() === stockMove._id.toString())) {
    po.stockMoveIds.push(stockMove._id as mongoose.Types.ObjectId);
  }

  // Update received quantities on PO lines
  for (const moveLine of stockMove.lines) {
    const poLine = po.orderLines.find(
      (line) => line.productId.toString() === moveLine.productId.toString()
    );
    if (poLine) {
      // Add the done quantity from goods receipt
      poLine.receivedQty = (poLine.receivedQty || 0) + (moveLine.done || moveLine.demand || 0);
    }
  }

  await po.save();

  // Run matching on any existing invoices linked to this PO to resolve mismatch if goods have now arrived
  const linkedInvoices = await Invoice.find({
    tenantId,
    poReference: poRef,
    moveType: "in_invoice",
    poMatchStatus: "mismatch",
  });

  for (const inv of linkedInvoices) {
    await runPOMatching(String(inv._id), tenantId);
  }
}

export async function matchStockTransferToPO(stockTransferId: string, tenantId: string) {
  const transfer = await StockTransfer.findOne({ _id: stockTransferId, tenantId });
  if (!transfer || transfer.header.operationType !== "incoming") {
    return;
  }

  const poRef = transfer.header.sourceDocument?.trim();
  if (!poRef) return;

  const po = await PurchaseOrder.findOne({ name: poRef, tenantId });
  if (!po) return;

  // Link StockTransfer to PO if not already linked
  if (!po.stockTransferIds) po.stockTransferIds = [];
  if (!po.stockTransferIds.some((id: any) => id.toString() === transfer._id.toString())) {
    po.stockTransferIds.push(transfer._id as mongoose.Types.ObjectId);
  }

  // Update received quantities on PO lines
  for (const opLine of transfer.operations_tab) {
    const poLine = po.orderLines.find(
      (line) => line.productId.toString() === opLine.productId.toString()
    );
    if (poLine) {
      // Add the done quantity from goods receipt
      poLine.receivedQty = (poLine.receivedQty || 0) + (opLine.done || opLine.demand || 0);
    }
  }

  await po.save();

  // Run matching on any existing invoices linked to this PO to resolve mismatch if goods have now arrived
  const linkedInvoices = await Invoice.find({
    tenantId,
    poReference: poRef,
    moveType: "in_invoice",
    poMatchStatus: "mismatch",
  });

  for (const inv of linkedInvoices) {
    await runPOMatching(String(inv._id), tenantId);
  }
}

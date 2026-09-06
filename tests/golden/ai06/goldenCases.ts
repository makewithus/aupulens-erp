import mongoose from "mongoose";

/**
 * AI-06's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-06's own fixture type (a vendor bill matched
 * against a Purchase Order).
 *
 * AI-06's `bill_match` mode is fully deterministic — `computeLineVariances()`
 * (`lib/accounting/matching.ts`) is plain quantity/price/receipt tolerance arithmetic, and the
 * vendor-identity check added during Chunk 9 verification (`invoice.partnerId` vs `po.partnerId`)
 * is a straight equality check — no LLM call anywhere in this workflow. Each case seeds one
 * vendor bill and (usually) one Purchase Order, fires `bill.created`, and checks the resulting
 * `matchResult.verdict` read from the run's own `AiDecisionTrace.rawProposal`.
 *
 * The "vendor-mismatch-adversarial" case formalises the real bug found and fixed during this
 * project's Chunk 9 verification pass (docs/ai/verification/AI-06.md §9): a bill from vendor B
 * referencing vendor A's real PO number, with line quantities/prices that happen to agree, used to
 * come back `verdict: "match"` — a textbook confidently-wrong answer a human would approve for
 * payment without a second look. This case is a permanent regression guard for that fix.
 *
 * `tests/golden/ai06.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface Ai06GoldenCase {
  id: string;
  description: string;
  /** "same" = the PO belongs to the same vendor as the bill (normal case); "different" = the PO
   *  belongs to a DIFFERENT vendor (the adversarial vendor-mismatch case); "none" = the bill
   *  carries no PO reference at all. */
  poVendor: "same" | "different" | "none";
  poLine?: { productQty: number; receivedQty: number; priceUnit: number };
  poMatchType?: "2_way" | "3_way";
  billLine: { quantity: number; priceUnit: number };
  expected: {
    verdict: "match" | "exception" | "no_po_reference" | "po_not_found";
    exceptionFindingCount: number;
    /** A substring that must appear in one of matchResult.variances, if given. */
    varianceContains?: string;
  };
}

export const AI06_GOLDEN_CASES: Ai06GoldenCase[] = [
  {
    id: "clean-match-silent",
    description: "The mandatory false positive: bill quantity/price agree with its own vendor's PO within tolerance — must verdict 'match', raise zero exception findings",
    poVendor: "same",
    poLine: { productQty: 10, receivedQty: 10, priceUnit: 12 },
    poMatchType: "2_way",
    billLine: { quantity: 10, priceUnit: 12 },
    expected: { verdict: "match", exceptionFindingCount: 0 },
  },
  {
    id: "quantity-mismatch-exception",
    description: "Bill quantity (50) far exceeds the PO's ordered quantity (10) — must verdict 'exception' with a quantity-variance reason",
    poVendor: "same",
    poLine: { productQty: 10, receivedQty: 10, priceUnit: 12 },
    poMatchType: "2_way",
    billLine: { quantity: 50, priceUnit: 12 },
    expected: { verdict: "exception", exceptionFindingCount: 1, varianceContains: "quantity variance" },
  },
  {
    id: "vendor-mismatch-adversarial",
    description: "A bill from a DIFFERENT vendor referencing another vendor's real PO, with line quantity/price agreeing exactly — must verdict 'exception' on vendor identity alone, never a confident match",
    poVendor: "different",
    poLine: { productQty: 10, receivedQty: 10, priceUnit: 12 },
    poMatchType: "2_way",
    billLine: { quantity: 10, priceUnit: 12 },
    expected: { verdict: "exception", exceptionFindingCount: 1, varianceContains: "different vendor" },
  },
  {
    id: "no-po-reference-silent",
    description: "A bill with no PO reference at all — must verdict 'no_po_reference' (a distinct silent branch from a clean match), raise zero exception findings",
    poVendor: "none",
    billLine: { quantity: 10, priceUnit: 12 },
    expected: { verdict: "no_po_reference", exceptionFindingCount: 0 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai06-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

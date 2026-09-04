import mongoose from "mongoose";

/**
 * AI-07's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic, tenant-
 * anonymised fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-07's own fixture type (PurchaseOrder lines,
 * not bills).
 *
 * AI-07 (accrual intelligence) is fully deterministic — `PurchaseOrder.orderLines[].receivedQty >
 * billedQty` GRNI evidence, no LLM call anywhere in the workflow (see the workflow's own doc
 * comment). Each case runs the `ai.sweep.hourly` GRNI scan against one seeded PurchaseOrder; a
 * case that also sets `matchingBillAmount` additionally creates a Invoice that matches the PO and
 * runs `bill.created` to exercise the accuracy-check branch (Chunk 9 0.1's
 * `reasoned.proposal.accrualAccuracy` / `ActResult.learningOutcome`), checking the resulting
 * `AiLearningRecord.outcome`.
 *
 * `tests/golden/ai07.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface GoldenPoLine {
  productQty: number;
  receivedQty: number;
  billedQty: number;
  priceUnit: number;
}

export interface Ai07GoldenCase {
  id: string;
  description: string;
  poLines: GoldenPoLine[];
  /** null = no AiMaterialityPolicy document created at all (the A.5 "no threshold configured"
   *  conservatism branch) */
  materialityThreshold: number | null;
  /** When set: after the GRNI sweep, create an Invoice for this amount, link it to the PO, and
   *  run `bill.created` to exercise the accuracy-check branch. */
  matchingBillAmount?: number;
  /** What a correct run of AI-07 must produce. */
  expected: {
    grniFindingCount: number;
    overBilledFindingCount: number;
    /** JournalEntry count after the ai.sweep.hourly run alone (before any bill.created run). */
    journalCountAfterSweep: number;
    /** Only checked when `matchingBillAmount` is set. */
    learningOutcome?: "accepted" | "edited";
  };
}

export const AI07_GOLDEN_CASES: Ai07GoldenCase[] = [
  {
    id: "grni-gap-below-threshold",
    description: "Received 10, billed 4 @ 100/unit, materiality threshold 100000 (600 amount is below it) — must draft a GRNI accrual",
    poLines: [{ productQty: 10, receivedQty: 10, billedQty: 4, priceUnit: 100 }],
    materialityThreshold: 100000,
    expected: { grniFindingCount: 1, overBilledFindingCount: 0, journalCountAfterSweep: 1 },
  },
  {
    id: "fully-billed-silent",
    description: "receivedQty equals billedQty — the mandatory false positive: must raise ZERO GRNI findings and draft nothing",
    poLines: [{ productQty: 10, receivedQty: 10, billedQty: 10, priceUnit: 100 }],
    materialityThreshold: 100000,
    expected: { grniFindingCount: 0, overBilledFindingCount: 0, journalCountAfterSweep: 0 },
  },
  {
    id: "over-billed-exception",
    description: "billedQty exceeds receivedQty — a real over-billing exception, not a GRNI accrual candidate",
    poLines: [{ productQty: 10, receivedQty: 4, billedQty: 10, priceUnit: 100 }],
    materialityThreshold: 100000,
    expected: { grniFindingCount: 0, overBilledFindingCount: 1, journalCountAfterSweep: 0 },
  },
  {
    id: "accuracy-check-exact-match",
    description: "GRNI accrual drafted, then a matching bill for the exact same amount arrives — learning record outcome must be 'accepted'",
    poLines: [{ productQty: 10, receivedQty: 10, billedQty: 0, priceUnit: 100 }],
    materialityThreshold: 100000,
    matchingBillAmount: 1000,
    expected: { grniFindingCount: 1, overBilledFindingCount: 0, journalCountAfterSweep: 1, learningOutcome: "accepted" },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai07-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

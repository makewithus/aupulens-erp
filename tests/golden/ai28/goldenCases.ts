/**
 * AI-28's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md 0.3) — realistic, tenant-anonymised
 * cut-off fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-28's own fixture type (a vendor bill, with or
 * without PurchaseOrder → StockMove receipt evidence, optionally against a locked prior period).
 *
 * `tests/golden/ai28.golden.test.ts` is the harness that seeds these, runs the real workflow
 * (a thin wrapper over `lib/aiRuntime/cutoff/evaluateCutoff.ts`), and reports a pass rate.
 */

export interface GoldenCase {
  id: string;
  description: string;
  amount: number;
  invoiceDate: string; // ISO date — the bill's own posted date
  /** Omit to build a bill with NO PurchaseOrder/StockMove link at all (evidence_unavailable). */
  receiptDate?: string; // ISO date — StockMove.effectiveDate, the real "goods received" evidence
  /** When set, a TransactionLock locks purchases up to this date. */
  lockedUpToDate?: string; // ISO date
  periodEnd: string; // ISO date passed as the workflow's periodEnd event payload
  expected: {
    findingRaised: boolean;
    proposedAction?: "reclass" | "current_period_adjustment";
    /** Substring the finding's `detail` must contain (e.g. the evidence period "2026-01"). */
    detailContains?: string[];
    /** How many bills in this run must be counted as evidence_unavailable — asserted via the
     *  workflow's own reasoned proposal (`Ai28Proposal.evidenceUnavailableCount`), not inferred
     *  from the absence of a finding, since "no finding" and "evidence unavailable" are different
     *  outcomes this workflow must never conflate (the whole point of A.3's "reports
     *  evidence_unavailable, not assumed correct" rule). */
    evidenceUnavailableCount: number;
  };
}

export const AI28_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "goods-received-prior-period-unlocked",
    description:
      "Goods physically received on Jan 30, vendor bill posted Feb 3, prior period NOT locked — must flag a cut-off exception proposing reclass to the earlier (receipt) period",
    amount: 10000,
    invoiceDate: "2026-02-03",
    receiptDate: "2026-01-30",
    periodEnd: "2026-02-05",
    expected: {
      findingRaised: true,
      proposedAction: "reclass",
      detailContains: ["2026-01", "2026-02"],
      evidenceUnavailableCount: 0,
    },
  },
  {
    id: "goods-received-prior-period-locked",
    description:
      "Same timing gap as above, but the prior period (through Jan 31) is locked — must propose a current-period adjustment instead of a back-dated post, and say so explicitly",
    amount: 10000,
    invoiceDate: "2026-02-03",
    receiptDate: "2026-01-30",
    lockedUpToDate: "2026-01-31",
    periodEnd: "2026-02-05",
    expected: {
      findingRaised: true,
      proposedAction: "current_period_adjustment",
      detailContains: ["current_period_adjustment", "never back-dated"],
      evidenceUnavailableCount: 0,
    },
  },
  {
    id: "same-period-no-timing-difference",
    description:
      "Goods received Jan 10, bill posted Jan 15 — both land in the same period. The mandatory false-positive check: must NOT raise a cut-off exception",
    amount: 10000,
    invoiceDate: "2026-01-15",
    receiptDate: "2026-01-10",
    periodEnd: "2026-01-31",
    expected: {
      findingRaised: false,
      evidenceUnavailableCount: 0,
    },
  },
  {
    id: "no-po-evidence-reported-honestly",
    description:
      "A vendor bill with no linked PurchaseOrder/StockMove at all — must NOT raise a finding, but must ALSO be counted as evidence_unavailable rather than silently treated as correct",
    amount: 5000,
    invoiceDate: "2026-02-01",
    // no receiptDate — no PO/StockMove created for this bill
    periodEnd: "2026-02-05",
    expected: {
      findingRaised: false,
      evidenceUnavailableCount: 1,
    },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai28-golden";

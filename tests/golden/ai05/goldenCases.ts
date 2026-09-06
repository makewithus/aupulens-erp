import mongoose from "mongoose";

/**
 * AI-05's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-05's own fixture type (open invoices + a
 * draft receipt).
 *
 * AI-05's receipt-allocation classification (`proposeAllocation()` in
 * `lib/aiRuntime/workflows/ai-05-receivables-operations/index.ts`) and its collection-worklist
 * false-positive guard are fully deterministic — plain arithmetic against real, already-recorded
 * `Payment`/`SalesInvoice` documents, no LLM call anywhere in the workflow. Each case seeds one
 * customer's open invoices and (optionally) one draft `Payment` with unused funds, runs
 * `ai.sweep.hourly`, and checks the resulting allocation classification and worklist size — read
 * from the run's own `AiDecisionTrace.rawProposal`, not from downstream writes, so the golden
 * dataset exercises AI-05's actual judgement rather than the separate real-User/RBAC plumbing its
 * DRAFT-tier financial write (`draft_receipt_allocation`) additionally requires (see
 * `tests/ai/aiRuntime/ai05ReceivablesOperationsEdgeCases.test.ts`'s own note on that).
 *
 * `tests/golden/ai05.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface Ai05GoldenInvoice {
  totalAmount: number;
  /** Relative to "now" at seed time — negative is overdue, positive is not yet due. */
  dueDateOffsetDays: number;
}

export interface Ai05GoldenCase {
  id: string;
  description: string;
  /** All invoices belong to the SAME customer. */
  invoices: Ai05GoldenInvoice[];
  /** A draft Payment with unused funds for that same customer, if any. */
  paymentUnusedAmount?: number;
  expected: {
    /** The allocation candidate's classification — undefined when no payment was seeded at all. */
    allocationType?: "exact" | "partial" | "batched" | "overpayment" | "short_payment" | "no_open_invoices";
    /** A "short payment" EXCEPTION finding must appear iff allocationType is "short_payment". */
    shortPaymentFindingRaised: boolean;
    /** Collection-worklist entry count for this customer. */
    worklistCount: number;
  };
}

export const AI05_GOLDEN_CASES: Ai05GoldenCase[] = [
  {
    id: "exact-single-invoice-allocation",
    description: "One overdue invoice, a draft receipt for exactly its due amount — must classify as an exact allocation",
    invoices: [{ totalAmount: 500, dueDateOffsetDays: -5 }],
    paymentUnusedAmount: 500,
    expected: { allocationType: "exact", shortPaymentFindingRaised: false, worklistCount: 1 },
  },
  {
    id: "short-payment-dispute",
    description: "One overdue ₹1,000 invoice, a receipt for ₹850 (85% — inside the documented short-payment band) — must open a dispute, never a false partial allocation",
    invoices: [{ totalAmount: 1000, dueDateOffsetDays: -2 }],
    paymentUnusedAmount: 850,
    expected: { allocationType: "short_payment", shortPaymentFindingRaised: true, worklistCount: 1 },
  },
  {
    id: "overpayment-credit",
    description: "One overdue ₹500 invoice, a receipt for ₹800 — must classify as an overpayment (credit on account), never forced onto anything else",
    invoices: [{ totalAmount: 500, dueDateOffsetDays: -2 }],
    paymentUnusedAmount: 800,
    expected: { allocationType: "overpayment", shortPaymentFindingRaised: false, worklistCount: 1 },
  },
  {
    id: "must-stay-silent-clean",
    description: "The mandatory false positive: one invoice not yet due, no lateness history, no draft payment at all — must produce no allocation candidate and no worklist entry",
    invoices: [{ totalAmount: 500, dueDateOffsetDays: 20 }],
    expected: { allocationType: undefined, shortPaymentFindingRaised: false, worklistCount: 0 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai05-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

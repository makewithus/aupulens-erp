import mongoose from "mongoose";

/**
 * AI-08's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai10/goldenCases.ts`'s shape (both workflows share the same "detect a candidate
 * against a threshold/keyword, INR-only, never auto-draft an inferred match" structure).
 *
 * AI-08's `detect` branch is fully deterministic — `detectServicePeriod()`
 * (`lib/aiRuntime/workflows/ai-08-prepaid-schedule/index.ts`) is a stated-date-range regex plus a
 * fixed keyword list, and the amortisation schedule is straight-line arithmetic — no LLM call
 * anywhere in this workflow. Each case seeds one vendor bill and fires `bill.created`.
 *
 * `tests/golden/ai08.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface Ai08GoldenCase {
  id: string;
  description: string;
  billDescription: string;
  billAmount: number;
  invoiceDate: string; // ISO date
  currencyId?: string; // default "INR"
  /** What a correct run of AI-08's detect branch must produce. */
  expected: {
    candidateFinding: boolean;
    fxUnsupportedFinding: boolean;
    scheduleCreated: boolean;
    /** Sum of all drafted schedule periods — must equal billAmount exactly. Only meaningful when scheduleCreated is true. */
    scheduleSum?: number;
  };
}

export const AI08_GOLDEN_CASES: Ai08GoldenCase[] = [
  {
    id: "stated-12-month-schedule",
    description: "A stated 12-month prepaid insurance bill — must raise a candidate finding AND draft a schedule whose periods sum exactly to the bill amount",
    billDescription: "Prepaid insurance for 12 months",
    billAmount: 120000,
    invoiceDate: "2026-01-17",
    expected: { candidateFinding: true, fxUnsupportedFinding: false, scheduleCreated: true, scheduleSum: 120000 },
  },
  {
    id: "one-month-rent-silent",
    description: "The mandatory false positive: a one-month rent bill with no cross-period span and no strong keyword — must NOT raise a candidate finding, must NOT create a schedule",
    billDescription: "Office rent for the month",
    billAmount: 20000,
    invoiceDate: "2026-02-01",
    expected: { candidateFinding: false, fxUnsupportedFinding: false, scheduleCreated: false },
  },
  {
    id: "non-inr-fx-unsupported",
    description: "A stated 12-month bill in USD — Batch B is INR-only, must raise fx_unsupported and NOT create a schedule",
    billDescription: "Prepaid insurance for 12 months",
    billAmount: 120000,
    invoiceDate: "2026-01-17",
    currencyId: "USD",
    expected: { candidateFinding: false, fxUnsupportedFinding: true, scheduleCreated: false },
  },
  {
    id: "inferred-keyword-never-autodrafts",
    description: "A bare keyword match ('Annual AMC contract') with no explicit date range — a plausible candidate finding IS raised, but is always RECOMMEND-only and never auto-drafts a schedule, regardless of confidence threshold",
    billDescription: "Annual AMC contract",
    billAmount: 50000,
    invoiceDate: "2026-04-01",
    expected: { candidateFinding: true, fxUnsupportedFinding: false, scheduleCreated: false },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai08-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

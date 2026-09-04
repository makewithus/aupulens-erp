import mongoose from "mongoose";

/**
 * AI-14's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic,
 * tenant-anonymised fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-14's own fixture type (journal-entry
 * postings against a single expense account vs a single cash account, current vs prior period).
 *
 * AI-14 is fully deterministic — no LLM call anywhere in the workflow (source: its own module
 * doc comment: "Driver decomposition is exact by construction, not narrative"). Every case here
 * reuses the exact fixture shapes already relied on in `tests/ai/aiRuntime/ai14FluxAnalysis.test.ts`,
 * formalised into the golden-dataset shape rather than rewritten (same move AI-27's own dataset
 * made).
 *
 * `tests/golden/ai14.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface GoldenAi14Entry {
  period: "prior" | "current";
  vendor: string;
  amount: number;
  date: string; // ISO date
  label?: string;
}

export interface GoldenAi14Case {
  id: string;
  description: string;
  entries: GoldenAi14Entry[];
  materialityPolicy?: { absoluteAmount?: number; percentOfBalance?: number };
  /** What a correct run of AI-14 must produce for the single expense account under test. */
  expected: {
    /** How many "Material movement: ..." findings should be raised for this account. */
    findingCount: number;
    /** Only asserted when findingCount > 0 — the exact variance the comparison row must report. */
    varianceExpected?: number;
    /** Only asserted when findingCount > 0 — a driver of this type must be present. */
    driverTypeExpected?: string;
    /** Only asserted when driverTypeExpected is set — that driver's exact amount. */
    driverAmountExpected?: number;
  };
}

export const AI14_GOLDEN_CASES: GoldenAi14Case[] = [
  {
    id: "new-vendor-material-driver",
    description:
      "Existing vendor steady month-over-month (no delta) + a brand-new vendor's material spend — must flag as a material movement with a 'new' driver, residual math exact",
    entries: [
      { period: "prior", vendor: "Golden Vendor A", amount: 1000, date: "2026-01-10" },
      { period: "current", vendor: "Golden Vendor A", amount: 1000, date: "2026-02-10" }, // recurring, zero delta
      { period: "current", vendor: "Golden Vendor B", amount: 5000, date: "2026-02-11" }, // brand-new counterparty
    ],
    materialityPolicy: { absoluteAmount: 1000 },
    expected: { findingCount: 1, varianceExpected: 5000, driverTypeExpected: "new", driverAmountExpected: 5000 },
  },
  {
    id: "flat-account-zero-movement-silent",
    description:
      "Same vendor, identical amount both periods — genuinely zero movement (not even reported as a comparison row) — the mandatory false positive, must raise ZERO findings",
    entries: [
      { period: "prior", vendor: "Golden Vendor C", amount: 100, date: "2026-01-10" },
      { period: "current", vendor: "Golden Vendor C", amount: 100, date: "2026-02-10" },
    ],
    expected: { findingCount: 0 },
  },
  {
    id: "immaterial-movement-below-threshold-silent",
    description:
      "A real 5% movement that stays below a deliberately-configured materiality threshold — must be reported unraised (immaterial), never escalated as a finding",
    entries: [
      { period: "prior", vendor: "Golden Vendor D", amount: 100, date: "2026-01-10" },
      { period: "current", vendor: "Golden Vendor D", amount: 105, date: "2026-02-10" },
    ],
    materialityPolicy: { absoluteAmount: 100000, percentOfBalance: 50 },
    expected: { findingCount: 0 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai14-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();
export const GOLDEN_PERIOD = "2026-02";

import mongoose from "mongoose";

/**
 * AI-16's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic,
 * tenant-anonymised fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-16's own fixture type (bank position +
 * AI-05/AI-06 decision-trace inflow/outflow schedules feeding a 30-day roll-forward).
 *
 * AI-16 has no LLM call anywhere in the workflow — the forecast is a plain roll-forward
 * (`opening + inflows - outflows = closing`, exactly) and risk/concentration detection is
 * threshold arithmetic over that forecast, per its own module doc comment. 100% is therefore the
 * honest bar. Cases here formalise the exact fixture shapes already relied on in
 * `tests/ai/aiRuntime/ai16CashIntelligence.test.ts`, not a second, different set.
 *
 * `tests/golden/ai16.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface GoldenInflow {
  ref: string;
  amount: number;
  daysFromToday: number;
}

export interface GoldenOutflow {
  ref: string;
  amount: number;
  daysFromToday: number;
}

export interface GoldenAi16Case {
  id: string;
  description: string;
  bankBalance: number;
  inflows?: GoldenInflow[];
  outflows?: GoldenOutflow[];
  /** What a correct run of AI-16 must produce. */
  expected: {
    /** How many "Projected cash shortfall" findings should be raised (envelope-level). */
    shortfallFindingCount: number;
    /** Only asserted when shortfallFindingCount > 0 — the exact shortfall amount reported. */
    shortfallAmountExpected?: number;
    /** Whether a proposal-level concentration-risk entry (shortfall = 0, cause mentions
     *  "concentration risk") must be present — a distinct decision branch from the shortfall
     *  check, since a concentration risk never becomes an envelope finding. */
    concentrationRiskExpected: boolean;
    /** Total number of proposal-level risk entries expected (shortfall risks + concentration
     *  risks combined) — the exact-count assertion, not just "some risk exists". */
    totalRiskCount: number;
  };
}

export const AI16_GOLDEN_CASES: GoldenAi16Case[] = [
  {
    id: "shortfall-from-large-due-bill",
    description:
      "Thin cash balance + a large AP bill due within the horizon, with a large AR collection landing the very next day — a real one-day cash-crunch shape, must raise exactly one exact-amount projected-shortfall finding (not a permanent shortfall, since cash recovers the next day)",
    bankBalance: 1000,
    outflows: [{ ref: "golden-bill-1", amount: 50000, daysFromToday: 2 }],
    // Split across three receivables (each well under the 40% concentration threshold) so this
    // case tests ONLY the shortfall branch, not the separate concentration-risk branch.
    inflows: [
      { ref: "golden-collection-1", amount: 20000, daysFromToday: 3 },
      { ref: "golden-collection-2", amount: 20000, daysFromToday: 3 },
      { ref: "golden-collection-3", amount: 20000, daysFromToday: 3 },
    ],
    expected: { shortfallFindingCount: 1, shortfallAmountExpected: 49000, concentrationRiskExpected: false, totalRiskCount: 1 },
  },
  {
    id: "concentration-risk-single-large-receivable",
    description:
      "Ample cash, no shortfall, but one predicted receivable is 80% of forecast inflows — a real proposal-level concentration risk (shortfall=0), never escalated as an envelope finding",
    bankBalance: 100000,
    inflows: [
      { ref: "golden-invoice-big", amount: 80000, daysFromToday: 5 },
      { ref: "golden-invoice-small", amount: 20000, daysFromToday: 10 },
    ],
    expected: { shortfallFindingCount: 0, concentrationRiskExpected: true, totalRiskCount: 1 },
  },
  {
    id: "ample-headroom-no-schedule-silent",
    description: "Large cash balance, no AI-05/AI-06 schedules, no payroll — the mandatory false positive, must raise ZERO risks of any kind",
    bankBalance: 10_000_000,
    expected: { shortfallFindingCount: 0, concentrationRiskExpected: false, totalRiskCount: 0 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai16-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

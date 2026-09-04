import mongoose from "mongoose";

/**
 * AI-10's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic, tenant-
 * anonymised fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-10's own fixture type (bills/assets).
 *
 * AI-10 (fixed asset intelligence) is fully deterministic in its capital-check and schedule-init
 * branches — keyword matching against a materiality threshold, or a straight-line depreciation
 * schedule computed from `Asset.originalValue`/`durationYears` — no LLM call anywhere in the
 * workflow. Each `bill` case seeds one Invoice (a vendor bill) and runs `bill.created`; each
 * `asset_created` case seeds one posted Asset and runs `asset.created`.
 *
 * `tests/golden/ai10.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface Ai10GoldenCase {
  id: string;
  description: string;
  scenario: "bill" | "asset_created";
  // --- "bill" scenario fields ---
  billDescription?: string;
  billAmount?: number;
  currencyId?: string; // default "INR"
  /** null = no AiMaterialityPolicy document created at all (the A.5 "no threshold configured" branch). */
  thresholdAmount?: number | null;
  // --- "asset_created" scenario fields ---
  assetOriginalValue?: number;
  assetDurationYears?: number;
  /** What a correct run of AI-10 must produce. */
  expected: {
    capitalCandidateFinding: boolean;
    thresholdConfiguredInDetail?: boolean;
    fxUnsupportedFinding: boolean;
    scheduleCreated?: boolean;
    /** Sum of all depreciation schedule periods — must equal originalValue exactly. */
    scheduleSum?: number;
  };
}

export const AI10_GOLDEN_CASES: Ai10GoldenCase[] = [
  {
    id: "above-threshold-capital-candidate",
    description: "Asset-like bill line (heavy machinery) totalling 500000, capitalisation threshold configured at 30000 — must raise a capital-expenditure candidate finding",
    scenario: "bill",
    billDescription: "Heavy machinery equipment",
    billAmount: 500000,
    thresholdAmount: 30000,
    expected: { capitalCandidateFinding: true, thresholdConfiguredInDetail: true, fxUnsupportedFinding: false },
  },
  {
    id: "below-threshold-silent",
    description: "Asset-like bill line (laptop) totalling 50000, capitalisation threshold configured at 100000 — the mandatory false positive: must NOT raise a capital candidate (below threshold, correctly expensed)",
    scenario: "bill",
    billDescription: "Laptop computer purchase",
    billAmount: 50000,
    thresholdAmount: 100000,
    expected: { capitalCandidateFinding: false, fxUnsupportedFinding: false },
  },
  {
    id: "non-inr-fx-unsupported",
    description: "Asset-like bill line in USD — must raise fx_unsupported and NOT evaluate as a capital candidate (Batch B is INR-only)",
    scenario: "bill",
    billDescription: "Heavy machinery equipment",
    billAmount: 500000,
    currencyId: "USD",
    thresholdAmount: 30000,
    expected: { capitalCandidateFinding: false, fxUnsupportedFinding: true },
  },
  {
    id: "posted-asset-schedule-init",
    description: "A posted Asset with no depreciation schedule yet (asset.created) — must create exactly one schedule whose periods sum exactly to originalValue",
    scenario: "asset_created",
    assetOriginalValue: 120000,
    assetDurationYears: 5,
    expected: { capitalCandidateFinding: false, fxUnsupportedFinding: false, scheduleCreated: true, scheduleSum: 120000 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai10-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

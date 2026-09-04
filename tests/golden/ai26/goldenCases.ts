/**
 * AI-26's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md 0.3) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring `tests/golden/ai27/
 * goldenCases.ts`'s shape for AI-26's own fixture type. Scoped to the two REAL judgement branches
 * this workflow implements today (`lib/aiRuntime/policyIntelligence/consistency.ts`):
 * capitalisation-treatment consistency, and uncovered-transaction-type coverage. The six A.3
 * inherited gaps (`lib/aiRuntime/policyIntelligence/inheritedGaps.ts`) are NOT golden-cased here —
 * they are fixed, always-present informational rows (already asserted directly in
 * `tests/ai/aiRuntime/ai26AccountingPolicy.test.ts`'s "all six A.3 inherited gaps" test), not a
 * judgement call with a decision branch that can regress silently.
 *
 * `tests/golden/ai26.golden.test.ts` is the harness that seeds these, runs the real workflow, and
 * reports a pass rate.
 */

export interface GoldenBillSeed {
  amount: number;
  /** "asset_fixed" (capitalised) or an expense-family account_type (expensed) — the only two
   *  routings `findCapitalizationInconsistencies` checks. */
  accountType: string;
  date: string; // ISO date
  name: string;
}

export interface GoldenCase {
  id: string;
  description: string;
  /** absoluteAmount for the "capitalisation" materiality threshold — undefined means not
   *  configured for this tenant. */
  capitalisationThreshold?: number;
  /** appliesTo values to ALSO configure a threshold for, beyond "capitalisation" itself — used by
   *  the uncovered-transaction-types case. */
  additionalConfiguredThresholds?: string[];
  bills: GoldenBillSeed[];
  expected: {
    /** How many "Inconsistent treatment: ..." findings the capitalisation consistency sweep must
     *  raise. */
    inconsistencyFindingCount: number;
    /** When inconsistencyFindingCount === 1, the exact capitalised/expensed example counts the
     *  finding must cite. */
    treatmentACount?: number;
    treatmentBCount?: number;
    /** "no materiality/policy threshold configured for ..." policy-gap titles that must NOT
     *  appear once every policy-relevant action class is configured. */
    uncoveredActionClassesMustBeAbsent?: string[];
  };
}

export const AI26_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "capitalisation-treatment-inconsistency",
    description:
      "Two bills above the configured capitalisation threshold from the same vendor family, one correctly capitalised, one miscoded to expense — must raise exactly one inconsistency finding citing both examples",
    capitalisationThreshold: 50000,
    bills: [
      { amount: 80000, accountType: "asset_fixed", date: "2026-01-05", name: "GOLDEN-CAPEX-1" },
      { amount: 90000, accountType: "expense", date: "2026-01-10", name: "GOLDEN-CAPEX-2-MISCODED" },
    ],
    expected: { inconsistencyFindingCount: 1, treatmentACount: 1, treatmentBCount: 1 },
  },
  {
    id: "consistent-capitalisation-treatment",
    description:
      "Two bills above the configured threshold, BOTH correctly capitalised — the mandatory false-positive check, must raise ZERO inconsistency findings",
    capitalisationThreshold: 50000,
    bills: [
      { amount: 80000, accountType: "asset_fixed", date: "2026-02-01", name: "GOLDEN-CAPEX-A" },
      { amount: 95000, accountType: "asset_fixed", date: "2026-02-10", name: "GOLDEN-CAPEX-B" },
    ],
    expected: { inconsistencyFindingCount: 0 },
  },
  {
    id: "all-policy-relevant-action-classes-configured",
    description:
      "Every policy-relevant action class (accrual, capitalisation, prepaid_schedule, revenue_recognition, inventory_intelligence, tax_intelligence) has a materiality threshold configured — the uncovered-transaction-type gap must NOT fire for any of them (a second false-positive check, on the coverage branch rather than the consistency branch)",
    capitalisationThreshold: 50000,
    additionalConfiguredThresholds: ["accrual", "prepaid_schedule", "revenue_recognition", "inventory_intelligence", "tax_intelligence"],
    bills: [],
    expected: {
      inconsistencyFindingCount: 0,
      uncoveredActionClassesMustBeAbsent: ["accrual", "capitalisation", "prepaid_schedule", "revenue_recognition", "inventory_intelligence", "tax_intelligence"],
    },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai26-golden";

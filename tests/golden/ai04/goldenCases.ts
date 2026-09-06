import mongoose from "mongoose";

/**
 * AI-04's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-04's own fixture type (expense claims).
 *
 * AI-04 (expense intelligence) is fully deterministic — no LLM call anywhere in the workflow
 * (`reason()` returns `confidence: 1` unconditionally, confirmed by reading
 * `lib/aiRuntime/workflows/ai-04-expense-intelligence/index.ts`). It checks one already-created
 * `Expense` against a tenant's optional `AiExpensePolicy` (`prohibited_category`/`over_limit`) plus
 * an always-on, policy-independent `duplicate_claim` check.
 *
 * `tests/golden/ai04.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface Ai04GoldenExpense {
  category: string;
  total: number;
  /** Shared across expenses within the same case to form a duplicate-claim pair — an arbitrary
   *  per-case label, mapped to a real ObjectId by the harness. */
  employeeKey?: string;
  expenseDate?: string; // ISO date
}

export interface Ai04GoldenCase {
  id: string;
  description: string;
  policy?: { categoryLimits?: { category: string; maxAmount: number }[]; prohibitedCategories?: string[] };
  /** All expenses seeded for this case, in order. The LAST one is the trigger
   *  (`expense.submitted` fires for it) — matches how the real route only ever fires on its own
   *  newly created record. */
  expenses: Ai04GoldenExpense[];
  /** What a correct run of AI-04 must produce for the trigger expense. */
  expected: {
    violationRules: ("prohibited_category" | "over_limit" | "duplicate_claim")[];
  };
}

export const AI04_GOLDEN_CASES: Ai04GoldenCase[] = [
  {
    id: "no-policy-absurd-amount-silent",
    description:
      "The mandatory false positive: an absurd ₹999,999 claim but NO AiExpensePolicy configured for the tenant — must raise ZERO violations, never invent a limit",
    expenses: [{ category: "travel", total: 999999 }],
    expected: { violationRules: [] },
  },
  {
    id: "over-limit-violation",
    description: "A travel claim of ₹5,000 against a configured ₹1,000 category limit — must flag over_limit",
    policy: { categoryLimits: [{ category: "travel", maxAmount: 1000 }] },
    expenses: [{ category: "travel", total: 5000 }],
    expected: { violationRules: ["over_limit"] },
  },
  {
    id: "prohibited-category-violation",
    description: "A claim in a tenant-prohibited category ('entertainment') — must flag prohibited_category",
    policy: { prohibitedCategories: ["entertainment"] },
    expenses: [{ category: "entertainment", total: 100 }],
    expected: { violationRules: ["prohibited_category"] },
  },
  {
    id: "within-limit-clean",
    description: "A ₹200 travel claim against a ₹1,000 limit, policy IS configured — must stay silent (policy exists but the claim is compliant, a distinct silent branch from 'no policy at all')",
    policy: { categoryLimits: [{ category: "travel", maxAmount: 1000 }] },
    expenses: [{ category: "travel", total: 200 }],
    expected: { violationRules: [] },
  },
  {
    id: "duplicate-claim-detected",
    description: "Same employee, same amount, same day, two claims — must flag duplicate_claim regardless of policy configuration",
    expenses: [
      { category: "meals", total: 300, employeeKey: "emp-x", expenseDate: "2026-03-10" },
      { category: "meals", total: 300, employeeKey: "emp-x", expenseDate: "2026-03-10" },
    ],
    expected: { violationRules: ["duplicate_claim"] },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai04-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

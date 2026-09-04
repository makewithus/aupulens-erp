import mongoose from "mongoose";

/**
 * AI-02's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md 0.3), built to the same standard as
 * AI-27's (`tests/golden/ai27/goldenCases.ts`).
 *
 * **Why every case here is 100%-checkable without a live model call** (per this chunk's
 * instructions, option (a)): AI-02's `reason()` (`lib/aiRuntime/workflows/ai-02-ledger-classification/index.ts`)
 * tries three steps in order — (1) the deterministic `BankingRule` engine
 * (`bankingRuleEngine.ts`, "no LLM call is made" when a rule matches), (2) deterministic
 * vendor/category classification history (`HISTORY_MIN_COUNT`/`HISTORY_MIN_SHARE`), and only then
 * (3) a model-ranking fallback via `callLlmForReasoning`. Every case below is seeded so it
 * resolves at step (1) or (2), OR — for the two "must not classify" cases — is seeded so it falls
 * through to step (3) with the real `@/lib/ai/tenantAi` module mocked to always return `gated:
 * true` (exactly the pattern `tests/ai/aiRuntime/ai02LedgerClassification.test.ts` already uses
 * for its own gated-model case). That mock is a deterministic safety net, not a live call: it
 * guarantees that even if a case's fixture unexpectedly reaches step (3), the outcome is fixed
 * and reproducible (no classification, 0 findings) rather than depending on real model output.
 * No case in this set is designed to test step (3)'s semantic ranking itself — that would
 * genuinely need a real or case-specific mocked model response, which the harness doesn't do here
 * because BankingRule-match and history-match are AI-02's own highest-value, real (never-applied-
 * before-this) deterministic logic, per the workflow's own doc comment.
 *
 * `tests/golden/ai02.golden.test.ts` is the harness that seeds each case, runs the real workflow
 * through `runWorkflow()`, and reports a pass rate.
 */

export type Ai02GoldenRecordModel = "Invoice" | "Expense";

export interface GoldenBankingRuleSeed {
  ruleName: string;
  applyTo: "deposits" | "withdrawals";
  criteriaMatch: "any" | "all";
  criteria: { field: string; operator: string; value: string }[];
}

export interface GoldenHistorySeed {
  /** Number of prior Invoices for the same vendor classified to the "target" account. */
  matchingCount: number;
  /** Number of prior Invoices for the same vendor classified to a different, unrelated account. */
  otherCount: number;
}

export interface GoldenCase {
  id: string;
  description: string;
  recordModel: Ai02GoldenRecordModel;
  vendorName?: string; // Invoice only
  description_: string; // subject description
  amount: number;
  /** BankingRule to seed for this tenant, if any. */
  bankingRule?: GoldenBankingRuleSeed;
  /** Whether the seeded BankingRule's target account is ALSO where prior history points — kept
   *  separate so cases can test history in isolation (no rule seeded at all). */
  history?: GoldenHistorySeed;
  /** Whether the triggering event carries a real acting user (needed to reach EXECUTE autonomy
   *  and actually write set_draft_account — see the workflow's `act()`). */
  hasActingUser: boolean;
  /** What a correct run of AI-02 must produce. */
  expected: {
    /** "explicit_rule" | "history" | "none" — which branch of reason() must fire. */
    basis: "explicit_rule" | "history" | "none";
    /** Whether findings[0].detail must reference the target account (proves the SPECIFIC account
     *  was chosen, not just "some finding fired"). False for the "none"/silent cases. */
    accountReferenced: boolean;
    /** Whether the account must actually be written onto the record (Invoice.invoiceLines[0].accountId
     *  or Expense.accountId) after the run — only true when hasActingUser && basis !== "none". */
    accountWritten: boolean;
  };
}

export const AI02_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "banking-rule-match-execute",
    description: "Clear BankingRule match (vendor name contains rule criterion), real acting user, EXECUTE autonomy — proposes AND writes the account (the correct-detection case)",
    recordModel: "Invoice",
    vendorName: "Golden Landlords Pvt Ltd",
    description_: "Monthly rent",
    amount: 15000,
    bankingRule: { ruleName: "Golden Rent Rule", applyTo: "withdrawals", criteriaMatch: "any", criteria: [{ field: "Vendor", operator: "Contains", value: "Landlords" }] },
    hasActingUser: true,
    expected: { basis: "explicit_rule", accountReferenced: true, accountWritten: true },
  },
  {
    id: "banking-rule-match-no-acting-user-recommend-only",
    description: "Same clear BankingRule match, but no acting user — autonomy caps at RECOMMEND: proposal fires but the account must NOT be written",
    recordModel: "Invoice",
    vendorName: "Golden Landlords Two Pvt Ltd",
    description_: "Monthly rent",
    amount: 15000,
    bankingRule: { ruleName: "Golden Rent Rule Two", applyTo: "withdrawals", criteriaMatch: "any", criteria: [{ field: "Vendor", operator: "Contains", value: "Landlords" }] },
    hasActingUser: false,
    expected: { basis: "explicit_rule", accountReferenced: true, accountWritten: false },
  },
  {
    id: "strict-all-rule-partially-satisfied-silent",
    description:
      "The mandatory false-positive check: an 'all' rule whose vendor criterion superficially matches but whose amount criterion does NOT — must NOT match this rule (or any other), and with no history, must raise zero findings rather than mis-classifying",
    recordModel: "Invoice",
    vendorName: "Golden Rent Lookalike Vendor",
    description_: "One-off purchase",
    amount: 1000,
    bankingRule: {
      ruleName: "Golden Strict Rule",
      applyTo: "withdrawals",
      criteriaMatch: "all",
      criteria: [
        { field: "Vendor", operator: "Contains", value: "Rent" },
        { field: "Amount", operator: "Greater Than", value: "999999" }, // never true for this fixture's amount
      ],
    },
    hasActingUser: true,
    expected: { basis: "none", accountReferenced: false, accountWritten: false },
  },
  {
    id: "history-based-classification",
    description:
      "No BankingRule matches this vendor, but 9/10 (90%) of prior invoices for the same vendor were classified to the same account — must classify from history, no model call. " +
      "(90% is deliberate, not 75%: AI-02's own history-vs-model decision only needs >=70% share, but the runtime's autonomy gate separately requires >=90% historicalStability to reach " +
      "EXECUTE and actually write the account — see lib/aiRuntime/policy/autonomyGate.ts's historicalStabilityThreshold, default 0.9. This case exercises both thresholds honestly.)",
    recordModel: "Invoice",
    vendorName: "Golden Recurring Supplier",
    description_: "Recurring supply",
    amount: 2000,
    history: { matchingCount: 9, otherCount: 1 },
    hasActingUser: true,
    expected: { basis: "history", accountReferenced: true, accountWritten: true },
  },
  {
    id: "expense-no-rule-no-history-silent",
    description: "An Expense record with no matching BankingRule and no classification history for its category — falls through to the (mocked-gated) model step and correctly proposes nothing rather than guessing",
    recordModel: "Expense",
    description_: "Unusual one-off expense",
    amount: 750,
    hasActingUser: true,
    expected: { basis: "none", accountReferenced: false, accountWritten: false },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai02-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

import mongoose from "mongoose";

/**
 * AI-03's golden dataset (docs/ai/BRIEF-09-VERIFICATION.md Part 0.3) — realistic,
 * tenant-anonymised, versioned fixtures with a KNOWN-CORRECT expected outcome per case.
 * Formalises the real decision branches already exercised in
 * `tests/ai/aiRuntime/ai03BankReconciliation.test.ts` (exact match, no candidate, multiple
 * candidates, fee classification, out-of-scope Sales-side receipt) into the golden-dataset shape,
 * the same move AI-27 made — not a second, different set of fixtures — plus one case that
 * targets the matcher's amount-tolerance boundary directly
 * (`AMOUNT_TOLERANCE = 0.01` in `lib/aiRuntime/workflows/ai-03-bank-reconciliation/matcher.ts`),
 * which the existing unit test suite doesn't exercise explicitly.
 *
 * `tests/golden/ai03.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface GoldenJournalEntrySeed {
  /** Posted journal entry amount on the bank account leg — a same-tenant candidate the matcher
   *  may or may not consider "close enough" to the bank line's own amount. */
  amount: number;
  /** The entry's header.date, offset in days from the bank line's own date (0 = same day). */
  dateOffsetDays?: number;
  label?: string;
}

export interface GoldenCase {
  id: string;
  description: string;
  bankLine: {
    amount: number;
    paymentRef: string;
    /** true => attach a Customer partnerId to the bank line — a receipt that only makes sense
     *  explained via the Sales module, out of AI-03's scope this batch (A.1). */
    withCustomerPartner?: boolean;
  };
  /** Posted journal entries on the same bank account, competing (or not) as match candidates. */
  journalEntries: GoldenJournalEntrySeed[];
  /** What a correct run of AI-03 must produce. */
  expected: {
    /** envelope.metrics.autoActioned — how many lines got auto-reconciled (EXECUTE, Pass 1 only). */
    autoActioned: number;
    /** A substring that must appear in exactly the finding title AI-03 raises for this line. */
    findingTitleContains: string;
  };
}

export const AI03_GOLDEN_CASES: GoldenCase[] = [
  {
    id: "exact-match-execute",
    description: "One bank line, one same-day, same-amount posted journal entry, real acting user — the sole EXECUTE-eligible path (A.5): auto-reconciled",
    bankLine: { amount: 5000, paymentRef: "Payment ref A" },
    journalEntries: [{ amount: 5000, dateOffsetDays: 0 }],
    expected: { autoActioned: 1, findingTitleContains: "Exact bank match" },
  },
  {
    id: "no-candidate-must-stay-silent",
    description: "No journal entry anywhere near this amount — must classify as unmatched and escalate, never force a guess at a match",
    bankLine: { amount: 7777, paymentRef: "Unidentified wire" },
    journalEntries: [],
    expected: { autoActioned: 0, findingTitleContains: "Unmatched bank line" },
  },
  {
    id: "amount-tolerance-boundary-match",
    description: "Candidate journal entry differs by exactly AMOUNT_TOLERANCE (0.01) — the boundary is inclusive (<=), so this must still match, not be treated as a near-miss",
    bankLine: { amount: 1000.0, paymentRef: "Payment ref B" },
    journalEntries: [{ amount: 1000.01, dateOffsetDays: 0 }],
    expected: { autoActioned: 1, findingTitleContains: "Exact bank match" },
  },
  {
    id: "ambiguous-multiple-candidates-escalate",
    description: "Two posted journal entries with the identical candidate amount and date — must escalate as a multiple-candidate proposal, never guess which one is right",
    bankLine: { amount: 2000, paymentRef: "Ambiguous" },
    journalEntries: [
      { amount: 2000, dateOffsetDays: 0, label: "Candidate 1" },
      { amount: 2000, dateOffsetDays: 0, label: "Candidate 2" },
    ],
    expected: { autoActioned: 0, findingTitleContains: "Multiple possible bank matches" },
  },
  {
    id: "bank-fee-classified-not-guessed",
    description: "A bank line referencing a service fee with no ledger candidate at all — classified bank_fee via the keyword heuristic (Pass 3), never mistaken for an unmatched payment",
    bankLine: { amount: -50, paymentRef: "Bank service fee" },
    journalEntries: [],
    expected: { autoActioned: 0, findingTitleContains: "Bank fee" },
  },
  {
    id: "customer-receipt-unknown-ar-side",
    description: "A bank line carrying a Customer partnerId with no Finance-side explanation — out of AI-03's scope this batch (A.1); must be reported, never guessed at as a Finance match",
    bankLine: { amount: 1500, paymentRef: "Customer receipt", withCustomerPartner: true },
    journalEntries: [],
    expected: { autoActioned: 0, findingTitleContains: "Sales-side" },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai03-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

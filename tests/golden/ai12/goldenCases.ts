import mongoose from "mongoose";

/**
 * AI-12's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-12's own fixture type.
 *
 * AI-12's real decision surface (per `tests/ai/aiRuntime/ai12TaxIntelligence.test.ts`, read in
 * full before writing this) is the three-way reconciliation (ledger vs projected transactions vs
 * return) plus the missing-evidence check — both deterministic, no LLM call anywhere in this
 * workflow ("the AI never computes a tax figure", `index.ts`'s own doc comment). Each golden case
 * seeds a vendor/customer invoice, optionally a matching (or deliberately mismatched) GST control
 * account ledger entry, and asserts the SPECIFIC finding shape AI-12's `act()` must produce —
 * never just "count > 0".
 */

export interface Ai12InvoiceSeed {
  moveType: "in_invoice" | "out_invoice";
  amountUntaxed: number;
  amountTax: number;
  /** Day of the fixed golden period (2026-01) this invoice posts on. */
  day: number;
  /** Omit to leave the vendor/customer with no GSTIN on file (the missing-evidence trigger). */
  partnerGstin?: string;
}

export interface Ai12LedgerSeed {
  /** Amount posted to the GST control account — deliberately equal to the invoice's tax amount
   *  for a clean tie-out, or deliberately off by a stated amount to seed a real gap. */
  controlAccountAmount: number;
  /** "debit" for the input-tax (debit-normal) shape a purchase invoice produces; "credit" for the
   *  output-tax (credit-normal) shape a sales invoice produces. */
  controlLeg: "debit" | "credit";
  day: number;
}

export interface Ai12GoldenCase {
  id: string;
  description: string;
  invoice: Ai12InvoiceSeed;
  /** Omit entirely to leave no TaxRate/control-account ledger configured at all. */
  ledger?: Ai12LedgerSeed;
  expected: {
    /** Exact count of `"Tax three-way mismatch..."` findings. Note: when the ledger disagrees
     *  with a single-direction period's transactions, it disagrees with `return` by the SAME
     *  amount too (transactions and return are mathematically identical for a single-direction
     *  case, by `act()`'s own design comment) — so a genuine ledger gap surfaces as TWO findings
     *  (`ledger_vs_transactions` AND `ledger_vs_return`), not one. This is correct behaviour, not
     *  a bug — confirmed by reading `act()`'s difference-building loop in full. */
    threeWayFindingCount: number;
    /** Exact count of `"...counterparty registration number"` findings (0 or 1 — AI-12 emits at
     *  most one combined finding for all missing-evidence rows in a period). */
    missingEvidenceFindingCount: number;
    /** Total envelope.findings.length — the SPECIFIC shape check, not just "something fired". */
    totalFindingCount: number;
    /** When a three-way gap is expected, the exact `ledger_vs_transactions` difference amount
     *  (absolute value, to 2dp). */
    ledgerVsTransactionsAmount?: number;
  };
}

export const PERIOD = "2026-01";

export const AI12_GOLDEN_CASES: Ai12GoldenCase[] = [
  {
    id: "seeded-one-unit-ledger-gap",
    description: "GSTIN on file, but the GST control account carries exactly ₹1.00 more than the projected output tax — must flag both ledger_vs_transactions AND ledger_vs_return (they're the same gap, seen two ways, in a single-direction period)",
    invoice: { moveType: "out_invoice", amountUntaxed: 550, amountTax: 99.01, day: 15, partnerGstin: "29ABCDE1234F1Z5" },
    ledger: { controlAccountAmount: 100.01, controlLeg: "credit", day: 15 },
    expected: { threeWayFindingCount: 2, missingEvidenceFindingCount: 0, totalFindingCount: 2, ledgerVsTransactionsAmount: 1 },
  },
  {
    id: "missing-counterparty-registration",
    description: "The ledger ties out to the projection exactly, but the vendor has no GSTIN on file — must flag missing evidence, and must NOT also raise a false three-way mismatch",
    invoice: { moveType: "in_invoice", amountUntaxed: 1000, amountTax: 180, day: 10 },
    ledger: { controlAccountAmount: 180, controlLeg: "debit", day: 10 },
    expected: { threeWayFindingCount: 0, missingEvidenceFindingCount: 1, totalFindingCount: 1 },
  },
  {
    id: "clean-reconciled-silent",
    description: "GSTIN on file, ledger ties out to the projection exactly — the mandatory false positive, must raise ZERO findings",
    invoice: { moveType: "in_invoice", amountUntaxed: 1000, amountTax: 180, day: 10, partnerGstin: "29ABCDE1234F1Z5" },
    ledger: { controlAccountAmount: 180, controlLeg: "debit", day: 10 },
    expected: { threeWayFindingCount: 0, missingEvidenceFindingCount: 0, totalFindingCount: 0 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai12-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

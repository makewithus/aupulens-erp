import mongoose from "mongoose";

/**
 * AI-17's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-17's own fixture type.
 *
 * AI-17 reads `tests/ai/aiRuntime/ai17ComplianceReadiness.test.ts` in full before writing this —
 * its real decision surface is `lib/aiRuntime/compliance/computeReadiness.ts`'s obligation
 * classification (`ready`/`at_risk`/`blocked`/`not_started`) and registration-gap detection, both
 * deterministic (no LLM call anywhere in AI-17 — `defaultAutonomy: OBSERVE`, zero tool calls).
 *
 * **Date-relativity, deliberately handled**: `computeComplianceReadiness()` scores deadline
 * proximity against `asOfDate` (default `new Date()`, i.e. real wall-clock "now") — AI-17's own
 * workflow never overrides this, unlike the base unit test which calls the computation function
 * directly with a fixed `asOfDate`. To keep this golden dataset's "ready" case correct on any run
 * date (not just the date it was written), its obligation uses a deliberately large
 * `dueDayOffset` (90 days) and a deliberately small `warningWindowDays` (1 day) — so `daysRemaining`
 * is always comfortably outside the warning window regardless of which day of the current month
 * this test happens to run on (worst case: today is the last day of a 31-day month, giving
 * `daysRemaining` >= 90 - 31 = 59, still far more than the 1-day window). The other two cases
 * (`registration-gap`, `blocked-missing-evidence`) are time-independent by design — a registration
 * gap and a "blocked" readiness are reported regardless of how much time is left, per this
 * workflow's own doc comment ("a real problem... is always blocked").
 */

export interface Ai17InvoiceSeed {
  moveType: "in_invoice" | "out_invoice";
  amountUntaxed: number;
  amountTax: number;
  day: number;
  /** Omit to leave the vendor with no GSTIN on file. */
  partnerGstin?: string;
}

export interface Ai17LedgerSeed {
  controlAccountAmount: number;
  controlLeg: "debit" | "credit";
  day: number;
}

export interface Ai17GoldenCase {
  id: string;
  description: string;
  /** Whether the profile's own registration (IN-KA/gst) is on file. */
  registrationOnFile: boolean;
  warningWindowDays: number;
  dueDayOffset: number;
  invoice?: Ai17InvoiceSeed;
  ledger?: Ai17LedgerSeed;
  expected: {
    registrationGapCount: number;
    /** Exact count of `"...obligation is ..."` findings (0 or 1 — one obligation is configured). */
    obligationFindingCount: number;
    /** When an obligation finding is expected, the exact readiness word it must report. */
    obligationReadiness?: "not_started" | "blocked" | "at_risk" | "ready";
    totalFindingCount: number;
  };
}

export const AI17_GOLDEN_CASES: Ai17GoldenCase[] = [
  {
    id: "registration-gap-no-tax-activity",
    description: "An obligation configured for IN-KA/gst with no matching registration on file, and no tax activity yet this period — must flag a registration gap AND report the obligation as not_started, never silently drop either",
    registrationOnFile: false,
    warningWindowDays: 21,
    dueDayOffset: 20,
    expected: { registrationGapCount: 1, obligationFindingCount: 1, obligationReadiness: "not_started", totalFindingCount: 2 },
  },
  {
    id: "blocked-missing-registration-number",
    description: "Registration on file, ledger ties out to the projection exactly, but the vendor has no GSTIN — must report the obligation as blocked (not merely at_risk), with no registration gap",
    registrationOnFile: true,
    warningWindowDays: 21,
    dueDayOffset: 20,
    invoice: { moveType: "in_invoice", amountUntaxed: 1000, amountTax: 180, day: 10 },
    ledger: { controlAccountAmount: 180, controlLeg: "debit", day: 10 },
    expected: { registrationGapCount: 0, obligationFindingCount: 1, obligationReadiness: "blocked", totalFindingCount: 1 },
  },
  {
    id: "ready-well-before-deadline-silent",
    description: "Registration on file, ledger ties out exactly, GSTIN on file, deadline far away — the mandatory false positive, must raise ZERO findings",
    registrationOnFile: true,
    warningWindowDays: 1,
    dueDayOffset: 90,
    invoice: { moveType: "in_invoice", amountUntaxed: 1000, amountTax: 180, day: 10, partnerGstin: "29ABCDE1234F1Z5" },
    ledger: { controlAccountAmount: 180, controlLeg: "debit", day: 10 },
    expected: { registrationGapCount: 0, obligationFindingCount: 0, totalFindingCount: 0 },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai17-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

/** The current calendar month (UTC) — computed once at import time so every case in this run uses
 *  the same "this period" AI-17's own `currentPeriod()` fallback would resolve to. */
export function currentPeriodYYYYMM(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

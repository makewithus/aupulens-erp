import mongoose from "mongoose";

/**
 * AI-18's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai27/goldenCases.ts`'s shape for AI-18's own fixture type.
 *
 * AI-18 reads `tests/ai/aiRuntime/ai18AuditEvidence.test.ts` in full before writing this. Its
 * `act()` sweeps AI-21's own `unsupportedMaterial` lines (`materiality === "material" AND
 * reconciliationStatus === "unreconciled"`, `lib/aiRuntime/statements/annotateStatement.ts`) and
 * builds a cited evidence pack for each via `traceAccountEvidence()`
 * (`lib/aiRuntime/audit/traceEvidence.ts`). Crucially, "swept" (material + GL-unreconciled) and
 * "has missing evidence" (no `ExtractedDocument`/no approval on file) are TWO INDEPENDENT signals
 * — an account can be swept (its GL doesn't tie out) while still being fully documented and
 * approved, or vice versa. This dataset deliberately covers both: a swept account WITH a real
 * missing-evidence gap (the correct-answer case), a swept account WITH full documentation (a
 * must-stay-silent case that specifically guards against conflating "swept" with "problem"), and
 * the true-empty case where nothing is material-and-unreconciled at all this period.
 *
 * Every account here needs a real AI-14 comparison on file (the `materialityVerdict` signal
 * `annotateStatement()` reads) — seeded the same way `seedAi14Comparison()` does in the base unit
 * test, and a real GL imbalance against the account's own open-invoice population to make
 * `runAllReconciliationDefinitions()` genuinely report it `unreconciled` (never faked).
 */

export interface Ai18GoldenCase {
  id: string;
  description: string;
  /** Seed a real AI-14 "material" comparison for the swept account. Omit entirely for the
   *  zero-swept-accounts case. */
  seedMaterialComparison: boolean;
  /** Whether the journal entry backing the account nets to a genuine, real unreconciled GL
   *  balance against the open invoice (true) or is left absent (irrelevant when
   *  seedMaterialComparison is false). */
  glUnreconciled: boolean;
  /** Whether a real `ExtractedDocument` is linked to the bill's `sourceId` (full documentation). */
  hasExtractedDocument: boolean;
  expected: {
    missingEvidenceFindingCount: number;
    sweepCapFindingCount: number;
    totalFindingCount: number;
    /** completenessScore must equal 1 exactly, or be strictly less than 1. */
    completenessScoreIsOne: boolean;
  };
}

export const AI18_GOLDEN_CASES: Ai18GoldenCase[] = [
  {
    id: "swept-account-missing-document",
    description: "A material, GL-unreconciled AP-control account whose posting has no ExtractedDocument on file — must raise a HIGH missing-evidence finding and a completenessScore below 1",
    seedMaterialComparison: true,
    glUnreconciled: true,
    hasExtractedDocument: false,
    expected: { missingEvidenceFindingCount: 1, sweepCapFindingCount: 0, totalFindingCount: 1, completenessScoreIsOne: false },
  },
  {
    id: "swept-but-fully-documented-silent",
    description: "A material, GL-unreconciled account that IS swept, but is fully documented (ExtractedDocument on file, no approval required) — must raise ZERO findings; being swept is not itself a problem",
    seedMaterialComparison: true,
    glUnreconciled: true,
    hasExtractedDocument: true,
    expected: { missingEvidenceFindingCount: 0, sweepCapFindingCount: 0, totalFindingCount: 0, completenessScoreIsOne: true },
  },
  {
    id: "nothing-material-this-period-silent",
    description: "No AI-14 material comparison exists for any account this period — zero accounts to sweep at all, a clean non-vacuous completenessScore of 1, must raise ZERO findings",
    seedMaterialComparison: false,
    glUnreconciled: false,
    hasExtractedDocument: false,
    expected: { missingEvidenceFindingCount: 0, sweepCapFindingCount: 0, totalFindingCount: 0, completenessScoreIsOne: true },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai18-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

// The `ap_control`/`ar_control_finance` reconciliation definitions this dataset depends on to
// produce a genuine "unreconciled" status (docs/ai/BRIEF-10-PRE-QA.md P0.5, concurrent with this
// task) now return `not_supported_for_closed_periods` for any period whose calendar month has
// already ended relative to real wall-clock "now" — a hardcoded past period like "2026-01" would
// silently make every "swept" case in this dataset produce zero swept accounts, not a real
// reconciliation failure. Using the CURRENT calendar month keeps this dataset testing what it
// says it tests (the sweep/missing-evidence mechanism) on any run date, not the separate
// point-in-time-scoping behaviour P0.5 owns.
function currentPeriodAndEnd(): { period: string; periodEnd: Date } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const period = `${y}-${String(m).padStart(2, "0")}`;
  const periodEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { period, periodEnd };
}

const { period: CURRENT_PERIOD, periodEnd: CURRENT_PERIOD_END } = currentPeriodAndEnd();
export const PERIOD = CURRENT_PERIOD;
export const PERIOD_END = CURRENT_PERIOD_END;

import mongoose from "mongoose";

/**
 * AI-30's golden dataset (docs/ai/BRIEF-10-PRE-QA.md P0.6) — realistic, tenant-anonymised
 * fixtures with a KNOWN-CORRECT expected outcome per case, mirroring
 * `tests/golden/ai19/goldenCases.ts`'s discriminated-union shape for a workflow that runs several
 * independent detectors (AI-19: master-data checks; AI-30: ops-health detectors) rather than one.
 *
 * AI-30's detectors (`lib/aiRuntime/opsHealth/detect.ts`) are plain deterministic Mongo queries
 * against fixed staleness/age cutoffs, and its two live repair types
 * (`requeue_dead_lettered_event`/`refresh_tax_projection`) are simple, idempotent state
 * transitions — no LLM call anywhere in this workflow (confirmed by AI-30's own module doc
 * comment and `tests/ai/aiRuntime/ai30ErpOperations.test.ts`'s source-grep test). Each case seeds
 * a tenant's health state directly and runs `ai.sweep.hourly`.
 *
 * `tests/golden/ai30.golden.test.ts` is the harness that runs these and reports a pass rate.
 */

export interface Ai30HealthyCase {
  scenario: "healthy";
  expected: { issueCount: number };
}

export interface Ai30BrokenMultiIssueCase {
  scenario: "broken_multi_issue";
  /** The exact, sorted set of issue types a correct run must detect — nothing more, nothing less. */
  expected: { issueTypes: string[] };
}

export interface Ai30RepairSuccessCase {
  scenario: "dead_letter_repair_success";
  expected: { eventStatusAfter: "pending"; repairOutcome: "success" };
}

export type Ai30GoldenCase = { id: string; description: string } & (Ai30HealthyCase | Ai30BrokenMultiIssueCase | Ai30RepairSuccessCase);

export const AI30_GOLDEN_CASES: Ai30GoldenCase[] = [
  {
    id: "healthy-tenant-silent",
    description: "The mandatory false positive: a tenant with no stuck records, no dead letters, no stale projections — must report ZERO issues",
    scenario: "healthy",
    expected: { issueCount: 0 },
  },
  {
    id: "broken-tenant-three-issue-types",
    description: "A tenant with a 40-day-old stuck draft, a dead-lettered event, and a tax projection older than newer source-invoice activity — all three distinct issue types must be detected, exactly",
    scenario: "broken_multi_issue",
    expected: { issueTypes: ["dead_lettered_event", "stale_tax_projection", "stuck_draft"] },
  },
  {
    id: "dead-letter-repaired-to-pending",
    description: "A dead-lettered AiEvent, kill switch on at CONTROLLED_AUTONOMOUS — must be autonomously repaired (requeued back to 'pending'), the one live repair type this chunk wires end to end",
    scenario: "dead_letter_repair_success",
    expected: { eventStatusAfter: "pending", repairOutcome: "success" },
  },
];

export const GOLDEN_TENANT_PREFIX = "ai30-golden";
export const GOLDEN_CREATOR = new mongoose.Types.ObjectId();

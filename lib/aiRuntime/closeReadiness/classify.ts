import { AI_CLOSE_BLOCKER_SEVERITY, AI_CLOSE_READINESS_STATUS, type AiCloseBlockerSeverity, type AiCloseReadinessStatus } from "@/models/ai/AiCloseState";

/**
 * AI-13's pure readiness classifier (docs/ai/BRIEF-04-BATCH-C.md, AI-13 algorithm step 2 —
 * "This function is pure and unit-tested against a fixture matrix... the AI explains and ranks;
 * it does not decide validity"). No DB reads here at all — every input is a plain value the
 * caller already looked up, so the same inputs always produce the same output.
 */

export interface ClassifyBlockerInput {
  /** A structural blocker regardless of amount — an unposted journal, a contradiction with
   *  `PeriodClosing`, a missing approval. Always HARD_BLOCKER, no materiality question applies. */
  isHard: boolean;
  amount?: number;
  ageDays: number;
  materialityConfigured: boolean;
  materialityThreshold?: number;
  staleDaysThreshold?: number;
}

export function classifyBlockerSeverity(input: ClassifyBlockerInput): AiCloseBlockerSeverity {
  if (input.isHard) return AI_CLOSE_BLOCKER_SEVERITY.HARD_BLOCKER;
  if (!input.materialityConfigured) return AI_CLOSE_BLOCKER_SEVERITY.UNCLASSIFIED;

  const staleDaysThreshold = input.staleDaysThreshold ?? 30;
  const isStale = input.ageDays >= staleDaysThreshold;
  const amount = Math.abs(input.amount ?? 0);
  const isMaterial = input.materialityThreshold !== undefined && amount >= input.materialityThreshold;

  if (isMaterial && isStale) return AI_CLOSE_BLOCKER_SEVERITY.HARD_BLOCKER; // material AND aged escalates
  if (isMaterial) return AI_CLOSE_BLOCKER_SEVERITY.MATERIAL_EXCEPTION;
  if (isStale) return AI_CLOSE_BLOCKER_SEVERITY.STALE;
  return AI_CLOSE_BLOCKER_SEVERITY.MINOR_EXCEPTION;
}

export interface ReadinessCounts {
  status: AiCloseReadinessStatus;
  score: number;
  hardBlockers: number;
  materialExceptions: number;
  minorExceptions: number;
  staleItems: number;
  domainsNotChecked: number;
}

/**
 * Rolls up every domain's blockers into the overall readiness verdict. A.4 — a single
 * UNCLASSIFIED blocker anywhere forces `indeterminate`, unconditionally: "a close that reports
 * ready because nobody configured materiality is the single worst output this batch could
 * produce." `not_checked`/`not_applicable` domains are counted separately and never themselves
 * read as blocking or ready.
 */
export function classifyReadiness(domains: { status: string; blockers: { severity: AiCloseBlockerSeverity }[] }[]): ReadinessCounts {
  let hardBlockers = 0;
  let materialExceptions = 0;
  let minorExceptions = 0;
  let staleItems = 0;
  let unclassified = 0;
  let domainsNotChecked = 0;

  for (const domain of domains) {
    if (domain.status === "not_checked") domainsNotChecked += 1;
    for (const blocker of domain.blockers) {
      switch (blocker.severity) {
        case AI_CLOSE_BLOCKER_SEVERITY.HARD_BLOCKER:
          hardBlockers += 1;
          break;
        case AI_CLOSE_BLOCKER_SEVERITY.MATERIAL_EXCEPTION:
          materialExceptions += 1;
          break;
        case AI_CLOSE_BLOCKER_SEVERITY.MINOR_EXCEPTION:
          minorExceptions += 1;
          break;
        case AI_CLOSE_BLOCKER_SEVERITY.STALE:
          staleItems += 1;
          break;
        case AI_CLOSE_BLOCKER_SEVERITY.UNCLASSIFIED:
          unclassified += 1;
          break;
      }
    }
  }

  let status: AiCloseReadinessStatus;
  if (unclassified > 0) status = AI_CLOSE_READINESS_STATUS.INDETERMINATE;
  else if (hardBlockers > 0) status = AI_CLOSE_READINESS_STATUS.BLOCKED;
  else if (materialExceptions > 0) status = AI_CLOSE_READINESS_STATUS.AT_RISK;
  else status = AI_CLOSE_READINESS_STATUS.READY;

  const score = Math.max(0, 100 - hardBlockers * 20 - materialExceptions * 10 - minorExceptions * 2 - staleItems - unclassified * 15);

  return { status, score, hardBlockers, materialExceptions, minorExceptions, staleItems, domainsNotChecked };
}

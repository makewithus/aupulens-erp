/**
 * The generic primitive behind A.5's 4th permitted repair — "re-link an orphan record to an
 * unambiguous parent (exactly one candidate; two means escalate)". Pure so it's directly testable
 * against exactly-zero/exactly-one/more-than-one candidate lists without a database.
 *
 * **Not wired to any live detector this chunk.** Surveyed every real parent-child relationship in
 * this codebase (`AiToolCall.runId`→`AiWorkflowRun`, `AiDecisionTrace.runId`→`AiWorkflowRun`,
 * `AiEvent`, `AiSchedule`) and none has a genuine "child lost its correct parent reference while
 * exactly one determinable candidate parent still exists" pattern: `AiToolCall.runId`/
 * `AiDecisionTrace.runId` are `required` at write time (never null), and no `Attachment` model or
 * detached-line pattern exists anywhere (confirmed by search) — so an `AiWorkflowRun` without a
 * trace (a real, detected orphan — see `detect.ts::findOrphanWorkflowRuns`) has no CORRECT PARENT
 * to relink to; the trace is simply missing, not misattached. Declared honestly in
 * `checksNotImplemented` by the workflow rather than forcing a fake case. The moment a genuinely
 * relinkable orphan pattern exists in this schema, this function is ready.
 */

export interface RelinkCandidate {
  parentId: string;
  parentLabel: string;
}

export interface RelinkDecision {
  outcome: "relinked" | "escalated_no_candidate" | "escalated_ambiguous";
  chosenParentId: string | null;
  reason: string;
}

export function decideRelink(candidates: RelinkCandidate[]): RelinkDecision {
  if (candidates.length === 0) return { outcome: "escalated_no_candidate", chosenParentId: null, reason: "no candidate parent found — needs a human" };
  if (candidates.length > 1) return { outcome: "escalated_ambiguous", chosenParentId: null, reason: `${candidates.length} candidate parents found — ambiguous, needs a human` };
  return { outcome: "relinked", chosenParentId: candidates[0].parentId, reason: `exactly one candidate parent (${candidates[0].parentLabel})` };
}

import {
  AI_AUTONOMY_LEVEL,
  AI_AUTONOMY_LEVEL_ORDER,
  type AiAutonomyLevel,
} from "@/lib/constants/statuses";
import type { ContextBundle } from "@/lib/aiRuntime/context/contextService";
import { isNeverAutonomous } from "@/lib/aiRuntime/policy/constants";

/**
 * The ONE shared decision gate (Part 2.3). Every workflow calls this same
 * function — it is not reimplemented per workflow. `killSwitchEnabled` on the
 * tenant's AiWorkflowPolicy IS the "kill switch" the brief's gate checklist
 * calls `kill_switch == off`: per Hard Rule 6 ("a kill switch, default OFF in
 * production until validated"), the switch's *default* position is the safe
 * one (workflow held at RECOMMEND); an operator turns it on once validated.
 * We name the field `killSwitchEnabled` (true = validated/on = may run
 * autonomously) rather than mirror the brief's inverted "== off" phrasing
 * literally, since that phrasing is ambiguous on its own and this is the
 * only reading consistent with Hard Rule 6's explicit default — flagged in
 * docs/ai/OPEN_QUESTIONS.md for confirmation, not left silently assumed.
 *
 * OBSERVE and RECOMMEND never write anything real (read-only / propose-only,
 * per the Part 2.3 autonomy table), so they need no gating at all. The seven
 * checks only apply when a workflow asks to go further than that — DRAFT,
 * EXECUTE, or CONTROLLED_AUTONOMOUS. NEVER_AUTONOMOUS action classes
 * (lib/aiRuntime/policy/constants.ts) are rejected before any check runs and
 * are not tenant-configurable.
 *
 * **`maxAutonomyLevel` clamp (docs/ai/BRIEF-04-BATCH-C.md Part 0.1)**: until this fix,
 * `AiWorkflowPolicy.maxAutonomyLevel` was stored on every policy row but never read here —
 * every ceiling enforced across Chunks 2-3 held only because each workflow's own code chose to
 * respect it, not because the runtime did. The effective ceiling is now
 * `min(workflow's declared requestedAutonomy, policy.maxAutonomyLevel)`: a missing or
 * unrecognized policy value clamps to RECOMMEND (fail closed, matching the existing
 * missing-policy-row default in contextService.ts), never up to the workflow's declared level.
 * `NEVER_AUTONOMOUS` action classes are rejected before this clamp even runs — a separate,
 * non-tenant-configurable hard ceiling, not expressed as a numeric level.
 */

export interface AutonomyGateInput {
  actionClass: string;
  requestedAutonomy: AiAutonomyLevel;
  /** Model self-reported confidence, 0-1. */
  confidence: number;
  /** Monetary amount at stake, if any — omit for non-monetary/read-only actions. */
  amount?: number;
  /** How often this exact pattern has been accepted historically, 0-1. Omit if no history exists yet. */
  historicalStability?: number;
  periodOpen: boolean;
  permissionOk: boolean;
  /** Workflow-supplied "does tenant policy specifically forbid this proposed action" — default true (allowed). */
  policyAllowsAction?: boolean;
  policy: ContextBundle["policy"];
}

export interface GateCheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

/** Which of the three ceilings actually bound the effective autonomy level this run —
 *  recorded on every decision so a clamp is visible in the trace, not just implied. */
export type AutonomyClampSource = "workflow_declared" | "policy_max_autonomy" | "never_autonomous";

export interface AutonomyDecision {
  allowed: boolean;
  autonomyApplied: AiAutonomyLevel;
  escalate: boolean;
  reasons: string[];
  checks: GateCheckResult[];
  clampedBy: AutonomyClampSource;
}

function evaluateGateChecks(input: AutonomyGateInput): GateCheckResult[] {
  const checks: GateCheckResult[] = [];

  checks.push({
    check: "confidence_threshold",
    passed: input.confidence >= input.policy.confidenceThreshold,
    detail: `confidence ${input.confidence.toFixed(2)} vs threshold ${input.policy.confidenceThreshold.toFixed(2)}`,
  });

  checks.push({
    check: "policy_allows_action",
    passed: input.policyAllowsAction ?? true,
    detail: input.policyAllowsAction === false ? "tenant policy forbids this action" : "no policy objection",
  });

  const materiality = input.policy.materialityThreshold;
  const materialityPassed = input.amount === undefined || materiality === undefined || input.amount < materiality;
  checks.push({
    check: "materiality",
    passed: materialityPassed,
    detail:
      input.amount === undefined
        ? "no monetary amount on this action"
        : materiality === undefined
          ? "no materiality threshold configured for this tenant/workflow"
          : `amount ${input.amount} vs materiality threshold ${materiality}`,
  });

  const stabilityPassed =
    input.historicalStability === undefined ||
    input.historicalStability >= input.policy.historicalStabilityThreshold;
  checks.push({
    check: "historical_stability",
    passed: stabilityPassed,
    detail:
      input.historicalStability === undefined
        ? "no historical pattern data yet for this subject"
        : `stability ${input.historicalStability.toFixed(2)} vs threshold ${input.policy.historicalStabilityThreshold.toFixed(2)}`,
  });

  checks.push({ check: "period_open", passed: input.periodOpen, detail: input.periodOpen ? "period is open" : "period is locked" });

  checks.push({
    check: "permission_ok",
    passed: input.permissionOk,
    detail: input.permissionOk ? "acting principal has the required permission" : "acting principal lacks the required permission",
  });

  checks.push({
    check: "kill_switch_enabled",
    passed: input.policy.killSwitchEnabled,
    detail: input.policy.killSwitchEnabled
      ? "workflow validated and enabled for this tenant"
      : "workflow kill switch is off (default) — not yet validated for autonomous action",
  });

  return checks;
}

/** Resolves `policy.maxAutonomyLevel` to a real index, defaulting to RECOMMEND for anything
 *  missing or not a recognized level — never trusting an unrecognized value upward. */
function policyCeilingIndex(policy: ContextBundle["policy"]): number {
  const recommendIdx = AI_AUTONOMY_LEVEL_ORDER.indexOf(AI_AUTONOMY_LEVEL.RECOMMEND);
  const idx = AI_AUTONOMY_LEVEL_ORDER.indexOf(policy.maxAutonomyLevel as AiAutonomyLevel);
  return idx < 0 ? recommendIdx : idx;
}

export function decideAutonomy(input: AutonomyGateInput): AutonomyDecision {
  if (isNeverAutonomous(input.actionClass)) {
    return {
      allowed: false,
      autonomyApplied: AI_AUTONOMY_LEVEL.NEVER_AUTONOMOUS,
      escalate: true,
      reasons: [`action class "${input.actionClass}" is NEVER_AUTONOMOUS — always human-gated, not tenant-configurable`],
      checks: [],
      clampedBy: "never_autonomous",
    };
  }

  // STANDING RULE (docs/ai/BRIEF-05-BATCH-D.md Part 0.5 — not obvious, so it's written down
  // here, not just followed): escalation decisions key off the workflow's DECLARED level, never
  // the clamped one. The clamp changes what a workflow is ALLOWED to do; it must never change
  // whether a human gets told it wanted to do more. Getting this backwards was a real bug this
  // check itself caught in testing (Chunk 4): applying the OBSERVE/RECOMMEND short-circuit to
  // the post-clamp level meant a workflow policy-clamped down to RECOMMEND took the same
  // `escalate: false` path as a workflow that natively declared RECOMMEND (AI-04) — silently
  // swallowing exactly the "this workflow wanted more but couldn't get it" signal the clamp
  // exists to surface. The check below reads `input.requestedAutonomy` — the workflow's own
  // declared ceiling, BEFORE the clamp two lines down — specifically to keep this correct.
  //
  // The workflow's own NATIVE ceiling, unclamped: if the workflow itself only ever asked for
  // OBSERVE/RECOMMEND (e.g. AI-04, AI-13's whole batch), that's propose-only by the workflow's
  // own design — no escalation is warranted regardless of what policy.maxAutonomyLevel says
  // (a policy can only lower a ceiling, and this ceiling is already at the floor).
  if (
    input.requestedAutonomy === AI_AUTONOMY_LEVEL.OBSERVE ||
    input.requestedAutonomy === AI_AUTONOMY_LEVEL.RECOMMEND
  ) {
    return {
      allowed: true,
      autonomyApplied: input.requestedAutonomy,
      escalate: false,
      reasons: ["OBSERVE/RECOMMEND require no gate — read-only or propose-only, never writes"],
      checks: [],
      clampedBy: "workflow_declared",
    };
  }

  // From here the workflow declared DRAFT/EXECUTE/CONTROLLED_AUTONOMOUS — apply the clamp
  // (docs/ai/BRIEF-04-BATCH-C.md Part 0.1). A missing/unrecognized policy row clamps to
  // RECOMMEND, never up to the workflow's declared level.
  const declaredIdx = AI_AUTONOMY_LEVEL_ORDER.indexOf(input.requestedAutonomy);
  const policyIdx = policyCeilingIndex(input.policy);
  const ceilingIdx = Math.min(declaredIdx, policyIdx);
  const recommendIdx = AI_AUTONOMY_LEVEL_ORDER.indexOf(AI_AUTONOMY_LEVEL.RECOMMEND);
  const clampedByPolicy = policyIdx < declaredIdx;
  const clampedBy: AutonomyClampSource = clampedByPolicy ? "policy_max_autonomy" : "workflow_declared";
  const clampReason = clampedByPolicy
    ? `autonomy clamped by policy.maxAutonomyLevel (workflow declared "${input.requestedAutonomy}", policy allows up to "${AI_AUTONOMY_LEVEL_ORDER[policyIdx]}")`
    : `autonomy ceiling is the workflow's own declared "${input.requestedAutonomy}" (policy.maxAutonomyLevel allows up to "${AI_AUTONOMY_LEVEL_ORDER[policyIdx]}", not the binding bound)`;

  if (ceilingIdx <= recommendIdx) {
    // Policy caps this run at or below RECOMMEND even though the workflow wanted more — this
    // must escalate for human attention exactly like every other gate failure below does
    // (confidence/permission/kill-switch/etc all funnel to the same fallthrough), not silently
    // behave as if the workflow had declared RECOMMEND natively.
    return {
      allowed: true,
      autonomyApplied: AI_AUTONOMY_LEVEL.RECOMMEND,
      escalate: true,
      reasons: [clampReason],
      checks: [],
      clampedBy,
    };
  }

  let candidateIdx = ceilingIdx;
  const allChecks: GateCheckResult[] = [];
  while (candidateIdx > recommendIdx) {
    const level = AI_AUTONOMY_LEVEL_ORDER[candidateIdx];
    const checks = evaluateGateChecks(input);
    allChecks.push(...checks);
    if (checks.every((c) => c.passed)) {
      return {
        allowed: true,
        autonomyApplied: level,
        escalate: false,
        reasons: [...checks.map((c) => c.detail), clampReason],
        checks: allChecks,
        clampedBy,
      };
    }
    candidateIdx -= 1;
  }

  return {
    allowed: true,
    autonomyApplied: AI_AUTONOMY_LEVEL.RECOMMEND,
    escalate: true,
    reasons: [...allChecks.filter((c) => !c.passed).map((c) => c.detail), clampReason],
    checks: allChecks,
    clampedBy,
  };
}

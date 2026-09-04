import type { AiAutonomyLevel } from "@/lib/constants/statuses";
import type { ContextBundle } from "@/lib/aiRuntime/context/contextService";
import type { IAiFinding } from "@/models/ai/AiWorkflowRun";
import type { AutonomyDecision } from "@/lib/aiRuntime/policy/autonomyGate";

/** What triggered a run — either a drained AiEvent or a direct manual invocation. */
export interface TriggerEvent {
  id?: string;
  tenantId: string;
  eventKey: string;
  payload: Record<string, unknown>;
}

/** Handles the executor passes into act()/verify() so a workflow can only touch
 *  data through the permissioned tool layer — never the ORM directly. */
export interface RuntimeHandles {
  runId: string;
  callTool<TResult = unknown>(
    toolName: string,
    args: Record<string, unknown>,
    opts?: { idempotencyKey?: string; requestedAutonomy?: AiAutonomyLevel; userId?: string },
  ): Promise<TResult>;
}

export interface ObservedResult<TRaw = unknown> {
  entityId: string;
  subjectRef?: { model: string; id: string };
  raw: TRaw;
}

export interface ReasonResult<TProposal = unknown> {
  proposal: TProposal;
  confidence: number;
  confidenceComponents?: Record<string, number>;
  findings: IAiFinding[];
  reasonChain: string[];
  /**
   * Real values for the autonomy gate's situational checks (Part 2.3), supplied by the
   * workflow itself. Omit any field to fall back to the executor's safe default — but a
   * workflow whose `defaultAutonomy` is above RECOMMEND MUST supply real `periodOpen` and
   * `permissionOk` values; the prior Chunk 1 default of hardcoding both `true` generically
   * was only safe because AI-00-SMOKE never left OBSERVE, and stops being safe the moment
   * any real workflow requests EXECUTE (see docs/ai/OPEN_QUESTIONS.md).
   */
  gateOverrides?: {
    amount?: number;
    historicalStability?: number;
    periodOpen?: boolean;
    permissionOk?: boolean;
    policyAllowsAction?: boolean;
  };
}

export interface ValidateResult {
  valid: boolean;
  vetoReason?: string;
}

export interface ActResult {
  findings: IAiFinding[];
  actionsTaken: { tool: string; args: Record<string, unknown>; reversible: boolean }[];
  /** `policy_overrides` — docs/ai/BRIEF-04-BATCH-C.md Part 0.3: incremented once per
   *  `allowNonStandard: true` tool call this run made, so the override rate is visible on the
   *  envelope rather than buried in trace records only. */
  metrics?: Partial<{ scanned: number; matched: number; exceptions: number; autoActioned: number; policy_overrides: number }>;
  /** Additional reason-chain entries from the act stage — appended to `reason()`'s own
   *  `reasonChain` in the finalized trace (lib/aiRuntime/runtime/executor.ts). Primarily for
   *  `allowNonStandard: true` uses: Part 0.3 requires every one to be named in the trace, not
   *  just passed silently to the tool call. */
  reasonChain?: string[];
  /** Chunk 9 (0.1) — an immediate, deterministic resolution for THIS run's own learning record,
   *  when `act()` already knows the answer (e.g. AI-07's accrual-accuracy check comparing this
   *  invoice against its own prior accrual). The executor applies this to the SAME
   *  `AiLearningRecord` it creates in the `learn` stage — never a second record, never a direct
   *  workflow write to `AiLearningRecord`. Omit when `act()` has no immediate signal; the record
   *  stays `pending` and resolves later via `lib/aiRuntime/learning/resolveOutcomes.ts` (a
   *  subjectRef-status check) or ages to `outcome_unknown` if nothing ever resolves it. */
  learningOutcome?: {
    outcome: import("@/lib/constants/statuses").AiLearningOutcome;
    downstreamResult?: string;
    editedValue?: Record<string, unknown>;
  };
}

export interface VerifyResult {
  ok: boolean;
  compensationNeeded?: boolean;
  detail?: string;
}

/**
 * The fixed 10-stage shape every AI-XX workflow implements (Part 2.1). `context`,
 * `learn` and `explain` are enforced generically by the executor (they don't vary
 * per workflow — see lib/aiRuntime/runtime/executor.ts) so only the seven
 * behavioural stages are hooks here. A workflow cannot skip a stage: the
 * executor calls all of them, in this order, every run.
 */
export interface WorkflowDefinition<TRaw = unknown, TExtracted = unknown, TProposal = unknown> {
  id: string;
  version: string;
  /** Event keys this workflow is registered against (lib/aiRuntime/runtime/registry.ts). */
  eventKeys: string[];
  /** Action class used for materiality lookups in the autonomy gate (e.g. "read_only", "journal_posting"). */
  actionClass: string;
  /** Ceiling this workflow will ever request, regardless of policy — never higher than this. */
  defaultAutonomy: AiAutonomyLevel;

  /**
   * Ownership predicate for a shared event key (docs/ai/BRIEF-04-BATCH-C.md Part 0.2) —
   * generalises the ad-hoc `schedule.due` ownership checks Batch B hand-wrote per workflow.
   * `lib/aiRuntime/runtime/eventBus.ts::dispatchEvent()` only enforces this when an eventKey has
   * MORE THAN ONE subscribed workflow (a genuinely "shared" key) — a workflow that is the sole
   * subscriber for a key needs no filter, there is nothing to disambiguate. On a shared key: no
   * filter declared → this workflow is skipped for that key (default-reject, so a workflow can
   * never silently receive another workflow's events just by registering the same eventKey
   * string); a filter that returns `false` also skips it. Return `true` for events this workflow
   * has always legitimately wanted (e.g. every workflow watching `bill.created` for its own
   * independent domain question — there is no single "owner" of a bill) and check real ownership
   * (e.g. `event.payload.scheduleId`'s `sourceRef.model`) for events that reference one specific
   * resource another workflow may have created. Evaluated once per candidate workflow, before
   * `runWorkflow()` (and therefore before any `AiWorkflowRun` row) is created for it.
   */
  subscriptionFilter?(event: TriggerEvent): boolean | Promise<boolean>;

  observe(event: TriggerEvent): Promise<ObservedResult<TRaw>>;
  extract(observed: ObservedResult<TRaw>, ctx: ContextBundle): Promise<TExtracted>;
  reason(extracted: TExtracted, ctx: ContextBundle): Promise<ReasonResult<TProposal>>;
  validate(reasoned: ReasonResult<TProposal>, ctx: ContextBundle): Promise<ValidateResult>;
  act(
    reasoned: ReasonResult<TProposal>,
    ctx: ContextBundle,
    decision: AutonomyDecision,
    rt: RuntimeHandles,
    extracted: TExtracted,
  ): Promise<ActResult>;
  verify(
    actResult: ActResult,
    ctx: ContextBundle,
    rt: RuntimeHandles,
    extracted: TExtracted,
  ): Promise<VerifyResult>;
}

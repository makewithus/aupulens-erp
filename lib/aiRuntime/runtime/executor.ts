import connectDB from "@/lib/db";
import AiWorkflowRun, { type IAiFinding } from "@/models/ai/AiWorkflowRun";
import {
  AI_RUN_STATUS,
  AI_AUTONOMY_LEVEL,
  AI_ATTENTION_PRIORITY,
  AI_FINDING_TYPE,
  type AiAttentionPriority,
  type AiRunStatus,
} from "@/lib/constants/statuses";
import { buildContext } from "@/lib/aiRuntime/context/contextService";
import { decideAutonomy, type AutonomyDecision } from "@/lib/aiRuntime/policy/autonomyGate";
import { callTool as callToolInner } from "@/lib/aiRuntime/tools/registry";
import {
  startTrace,
  appendToolCall,
  appendPolicyEvaluations,
  finalizeTrace,
} from "@/lib/aiRuntime/audit/auditTrace";
import { recordProposal, recordOutcome } from "@/lib/aiRuntime/learning/learningStore";
import { createAttentionItem } from "@/lib/aiRuntime/attention/attentionEngine";
import { toEnvelope, type WorkflowRunEnvelope } from "@/lib/aiRuntime/contracts/outputContract";
import type {
  ActResult,
  RuntimeHandles,
  TriggerEvent,
  VerifyResult,
  WorkflowDefinition,
} from "@/lib/aiRuntime/workflows/types";

/**
 * The fixed 10-stage pipeline (Part 2.1). This is THE executor — no workflow
 * can skip a stage because every stage runs here, not inside workflow code.
 * `context`, `learn`, and `explain` are fully generic (they don't vary per
 * workflow); `observe`/`extract`/`reason`/`validate`/`act`/`verify` are the
 * workflow's own hooks, always called in this order.
 *
 * Idempotency/replay-safety: before doing anything, this looks up an
 * existing AiWorkflowRun on {workflowId, triggerEventId} — matched by
 * AiWorkflowRun's own compound unique index — and returns it unchanged if
 * found, rather than re-executing. A direct/manual invocation with no
 * triggerEventId (e.g. a test calling runWorkflow directly) is not replay-
 * protected by this mechanism, by design — that path is for ad-hoc testing,
 * not for real event-driven triggers.
 */
export async function runWorkflow(
  workflow: WorkflowDefinition<any, any, any>,
  event: TriggerEvent,
): Promise<WorkflowRunEnvelope> {
  await connectDB();

  if (event.id) {
    const existing = await AiWorkflowRun.findOne({ workflowId: workflow.id, triggerEventId: event.id });
    if (existing) return toEnvelope(existing);
  }

  // observe — Idempotent on event_id (Part 2.1). Runs before the run row
  // exists because we need entityId to create it.
  const observed = await workflow.observe(event);

  // event.id must be genuinely OMITTED (not set to undefined/null) when absent — the
  // {workflowId, triggerEventId} unique index is sparse, which only skips documents where
  // the field is truly absent, not documents storing an explicit null. Spreading a
  // conditional object (rather than always assigning `triggerEventId: event.id`) is what
  // keeps the field absent; found via a real test collision (two direct, event-id-less
  // invocations of the same workflow otherwise violate the unique index).
  const run = await AiWorkflowRun.create({
    tenantId: event.tenantId,
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    entityId: observed.entityId,
    ...(event.id ? { triggerEventId: event.id } : {}),
    status: AI_RUN_STATUS.RUNNING,
    autonomyApplied: AI_AUTONOMY_LEVEL.OBSERVE,
    startedAt: new Date(),
  });
  const runId = String(run._id);

  const traceId = await startTrace({
    tenantId: event.tenantId,
    runId,
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    inputs: event.payload,
  });

  // A generic convention every TriggerEvent payload may carry: the real human user acting
  // on whose behalf this run happens (e.g. a UI-initiated action). Absent for autonomous,
  // event-triggered runs — see docs/ai/OPEN_QUESTIONS.md for what that means for the gate.
  const eventActingUserId = event.payload.actingUserId ? String(event.payload.actingUserId) : undefined;

  const rt: RuntimeHandles = {
    runId,
    callTool: async (toolName, args, opts) => {
      const { result, record } = await callToolInner(
        toolName,
        args,
        {
          tenantId: event.tenantId,
          runId,
          requestedAutonomy: opts?.requestedAutonomy ?? AI_AUTONOMY_LEVEL.OBSERVE,
          userId: opts?.userId ?? eventActingUserId,
        },
        { idempotencyKey: opts?.idempotencyKey },
      ).catch(async (err) => {
        const record = (err as { toolCallRecord?: Parameters<typeof appendToolCall>[1] }).toolCallRecord;
        if (record) await appendToolCall(traceId, record);
        throw err;
      });
      await appendToolCall(traceId, record);
      return result as any;
    },
  };

  try {
    // context — read-only bundle assembly (Part 2.2), fully generic.
    const context = await buildContext(event.tenantId, workflow.id, observed.entityId, observed.subjectRef);

    // extract
    const extracted = await workflow.extract(observed, context);

    // reason
    const reasoned = await workflow.reason(extracted, context);

    // validate — the deterministic engine can veto the model (Hard Rule 3).
    const validation = await workflow.validate(reasoned, context);

    if (!validation.valid) {
      await appendPolicyEvaluations(traceId, [
        { check: "deterministic_validation", passed: false, detail: validation.vetoReason ?? "vetoed" },
      ]);
      await recordProposal({
        tenantId: event.tenantId,
        workflowId: workflow.id,
        runId,
        proposal: reasoned.proposal as Record<string, unknown>,
      });
      await createAttentionItem({
        tenantId: event.tenantId,
        workflowId: workflow.id,
        runId,
        priority: AI_ATTENTION_PRIORITY.MEDIUM,
        what: `${workflow.id} proposal vetoed by deterministic validation`,
        why: validation.vetoReason ?? "the deterministic engine disagreed with the model",
        dedupeKey: `${workflow.id}:${runId}:veto`,
      });
      await finalizeTrace(traceId, {
        finalOutcome: AI_RUN_STATUS.ESCALATED,
        reasonChain: [...reasoned.reasonChain, `VETOED: ${validation.vetoReason}`],
        rawProposal: reasoned.proposal as Record<string, unknown>,
        confidenceComponents: reasoned.confidenceComponents,
      });
      run.status = AI_RUN_STATUS.ESCALATED;
      run.autonomyApplied = AI_AUTONOMY_LEVEL.RECOMMEND;
      run.summary = `Deterministic validation vetoed the model's proposal: ${validation.vetoReason}`;
      run.findings = reasoned.findings;
      run.finishedAt = new Date();
      await run.save();
      return toEnvelope(run);
    }

    // The gate (Part 2.3) — one shared function, not reimplemented per workflow.
    // periodOpen/permissionOk default to true only because a workflow that never
    // requests above RECOMMEND (e.g. AI-00-SMOKE) never reaches these checks at all
    // (see decideAutonomy's own OBSERVE/RECOMMEND short-circuit) — any workflow whose
    // defaultAutonomy is DRAFT or higher MUST supply real values via
    // reasoned.gateOverrides, or it is trusting an unsafe default (docs/ai/OPEN_QUESTIONS.md).
    const overrides = reasoned.gateOverrides ?? {};
    const decision: AutonomyDecision = decideAutonomy({
      actionClass: workflow.actionClass,
      requestedAutonomy: workflow.defaultAutonomy,
      confidence: reasoned.confidence,
      amount: overrides.amount,
      historicalStability: overrides.historicalStability,
      periodOpen: overrides.periodOpen ?? true,
      permissionOk: overrides.permissionOk ?? true,
      policyAllowsAction: overrides.policyAllowsAction,
      policy: context.policy,
    });
    await appendPolicyEvaluations(traceId, decision.checks);

    // decision.allowed is only ever false for a NEVER_AUTONOMOUS action class
    // (Hard Rule 4). Fail closed structurally here — act()/verify() must never
    // run in that case, not rely on the workflow's own act() to check
    // decision.allowed itself. Every other path (including "dropped to
    // RECOMMEND, escalate: true") still calls act(), since RECOMMEND-level
    // act() implementations only ever propose, never write — the gate only
    // forbids the *tool layer* from executing beyond what autonomyApplied
    // allows (enforced independently by callTool()'s own max_autonomy_level
    // check), not from running act() at all.
    let actResult: ActResult;
    let verifyResult: VerifyResult;
    if (!decision.allowed) {
      actResult = { findings: [], actionsTaken: [] };
      verifyResult = { ok: true };
    } else {
      // act — tools only, never the ORM directly.
      actResult = await workflow.act(reasoned, context, decision, rt, extracted);
      // verify — re-read and assert the intended effect.
      verifyResult = await workflow.verify(actResult, context, rt, extracted);
    }

    const allFindings: IAiFinding[] = [...reasoned.findings, ...actResult.findings];

    let status: AiRunStatus = AI_RUN_STATUS.NO_ACTION;
    if (!decision.allowed || decision.escalate || !verifyResult.ok) status = AI_RUN_STATUS.ESCALATED;
    else if (actResult.actionsTaken.length > 0) status = AI_RUN_STATUS.COMPLETED;

    // escalate — always with evidence. Per-FINDING, not just per-run: a workflow that
    // processes several subjects in one run (e.g. AI-03 scanning many bank lines) can have
    // some subjects complete cleanly while others still need a human — those must not be
    // silently dropped just because the run's overall status ended up "completed". An
    // EXCEPTION-type finding, or a PROPOSAL below this workflow's confidence threshold,
    // always gets an attention item; everything else additionally escalates whenever the
    // whole run did (NEVER_AUTONOMOUS, a veto, or a failed verify).
    for (const finding of allFindings) {
      const findingNeedsAttention =
        status === AI_RUN_STATUS.ESCALATED ||
        finding.type === AI_FINDING_TYPE.EXCEPTION ||
        (finding.type === AI_FINDING_TYPE.PROPOSAL && finding.confidence < context.policy.confidenceThreshold);
      if (!findingNeedsAttention) continue;

      await createAttentionItem({
        tenantId: event.tenantId,
        workflowId: workflow.id,
        runId,
        // AiFindingSeverity and AiAttentionPriority share the same five literal
        // values (critical/high/medium/low/info) by design — see statuses.ts.
        priority: (finding.severity as unknown as AiAttentionPriority) ?? AI_ATTENTION_PRIORITY.MEDIUM,
        what: finding.title,
        why: finding.detail || decision.reasons.join("; ") || verifyResult.detail || "escalated",
        evidence: finding.evidence,
        impactAmount: finding.amount,
        dedupeKey: `${workflow.id}:${finding.id}`,
      });
    }

    // learn — persists proposal; never mutates rules directly. Chunk 9 (0.1): the ONE creation
    // point for this run's AiLearningRecord — a workflow's act() can supply an immediate
    // resolution via ActResult.learningOutcome (applied to this SAME record, never a second one;
    // AiLearningRecord.runId carries a unique index that would reject a genuine duplicate).
    const learningRecordId = await recordProposal({
      tenantId: event.tenantId,
      workflowId: workflow.id,
      runId,
      proposal: reasoned.proposal as Record<string, unknown>,
    });
    if (actResult.learningOutcome) {
      await recordOutcome({
        learningRecordId,
        outcome: actResult.learningOutcome.outcome,
        downstreamResult: actResult.learningOutcome.downstreamResult,
        editedValue: actResult.learningOutcome.editedValue,
      });
    }

    // explain — always writes the reason chain, even for read-only runs.
    await finalizeTrace(traceId, {
      finalOutcome: status,
      reasonChain: [...reasoned.reasonChain, ...decision.reasons, ...(actResult.reasonChain ?? [])],
      rawProposal: reasoned.proposal as Record<string, unknown>,
      confidenceComponents: reasoned.confidenceComponents,
    });

    run.status = status;
    run.autonomyApplied = decision.autonomyApplied;
    run.summary =
      status === AI_RUN_STATUS.ESCALATED
        ? `${workflow.id} escalated for human review`
        : status === AI_RUN_STATUS.COMPLETED
          ? `${workflow.id} completed ${actResult.actionsTaken.length} action(s)`
          : `${workflow.id} ran with no action required`;
    run.findings = allFindings;
    run.metrics = { ...run.metrics, ...actResult.metrics };
    run.finishedAt = new Date();
    await run.save();

    return toEnvelope(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finalizeTrace(traceId, {
      finalOutcome: AI_RUN_STATUS.FAILED,
      reasonChain: [`FAILED: ${message}`],
    }).catch(() => undefined);
    run.status = AI_RUN_STATUS.FAILED;
    run.summary = `${workflow.id} failed: ${message}`;
    run.finishedAt = new Date();
    await run.save().catch(() => undefined);
    throw err;
  }
}

export async function replay(runId: string): Promise<WorkflowRunEnvelope> {
  await connectDB();
  const run = await AiWorkflowRun.findById(runId);
  if (!run) throw new Error(`No AiWorkflowRun found with id ${runId}`);
  if (!run.triggerEventId) throw new Error(`Run ${runId} has no triggerEventId — cannot be replayed`);

  const { default: AiEvent } = await import("@/models/ai/AiEvent");
  const { getWorkflow } = await import("@/lib/aiRuntime/runtime/registry");

  const event = await AiEvent.findById(run.triggerEventId);
  if (!event) throw new Error(`Trigger event ${run.triggerEventId} not found — cannot replay`);

  const workflow = getWorkflow(run.workflowId);
  if (!workflow) throw new Error(`Workflow ${run.workflowId} is not registered — cannot replay`);

  // runWorkflow's own idempotency check will short-circuit to the existing run.
  return runWorkflow(workflow, {
    id: String(event._id),
    tenantId: event.tenantId,
    eventKey: event.eventKey,
    payload: event.payload,
  });
}

export interface WorkflowPreview {
  proposal: Record<string, unknown>;
  findings: IAiFinding[];
  autonomyApplied: import("@/lib/constants/statuses").AiAutonomyLevel;
  decisionAllowed: boolean;
  decisionReasons: string[];
}

/**
 * AI-NL's confirmation preview (docs/ai/BRIEF-08b-FINAL.md B.3: "the preview states the concrete
 * effect... derived from the workflow's proposed actions, not from the model's description of
 * them"). Runs `context → extract → reason → validate → decideAutonomy` — the exact same calls
 * `runWorkflow()` makes — and stops there: **no `act()`, no tool call, nothing persisted, no
 * `AiWorkflowRun` row created.** This is what makes a chat preview safe to show before a human
 * confirms: it is not a second, disagreeing computation of what the workflow would do, it is the
 * first half of the same one, just not carried through to a write.
 */
export async function previewWorkflow(workflow: WorkflowDefinition<any, any, any>, event: TriggerEvent): Promise<WorkflowPreview> {
  await connectDB();
  const observed = await workflow.observe(event);
  const context = await buildContext(event.tenantId, workflow.id, observed.entityId, observed.subjectRef);
  const extracted = await workflow.extract(observed, context);
  const reasoned = await workflow.reason(extracted, context);
  const validation = await workflow.validate(reasoned, context);

  if (!validation.valid) {
    return { proposal: reasoned.proposal as Record<string, unknown>, findings: reasoned.findings, autonomyApplied: AI_AUTONOMY_LEVEL.RECOMMEND, decisionAllowed: false, decisionReasons: [validation.vetoReason ?? "vetoed"] };
  }

  const overrides = reasoned.gateOverrides ?? {};
  const decision: AutonomyDecision = decideAutonomy({
    actionClass: workflow.actionClass,
    requestedAutonomy: workflow.defaultAutonomy,
    confidence: reasoned.confidence,
    amount: overrides.amount,
    historicalStability: overrides.historicalStability,
    periodOpen: overrides.periodOpen ?? true,
    permissionOk: overrides.permissionOk ?? true,
    policyAllowsAction: overrides.policyAllowsAction,
    policy: context.policy,
  });

  return {
    proposal: reasoned.proposal as Record<string, unknown>,
    findings: reasoned.findings,
    autonomyApplied: decision.autonomyApplied,
    decisionAllowed: decision.allowed,
    decisionReasons: decision.reasons,
  };
}

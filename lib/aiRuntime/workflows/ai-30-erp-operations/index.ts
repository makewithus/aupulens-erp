import {
  findStuckDrafts,
  findStuckPendingApprovalJournals,
  findStuckWorkflowRuns,
  findStuckToolCalls,
  findDeadLetteredEvents,
  findFailedIntegrations,
  findStaleTaxProjections,
  findStaleFxRates,
  findOverdueSchedules,
  findOrphanWorkflowRuns,
  findDuplicateRunExecutions,
} from "@/lib/aiRuntime/opsHealth/detect";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-30 — ERP operations intelligence (docs/ai/BRIEF-08a-BATCH-G.md). The plumbing: stuck
 * workflows, failed integrations, unprocessed events, stale data and broken dependencies — found
 * and, where safe, fixed, before a user notices.
 *
 * **The only workflow in this batch gaining real autonomous repair** (A.4: `CONTROLLED_AUTONOMOUS`
 * for idempotent reversible repairs only), and tightly bound to A.5's exactly 4 permitted repair
 * types. This chunk wires **2 of the 4 live** (re-queue a dead-lettered `AiEvent`, refresh a stale
 * tax projection) — the other 2 are declared honestly in `checksNotImplemented`, not faked: orphan
 * relink has no real case in this schema (`lib/aiRuntime/opsHealth/relinkOrphan.ts`'s own doc
 * comment), and integration-sync retry has no safe write path at all for an autonomous action —
 * see `lib/aiRuntime/tools/opsHealthTools.ts`'s own doc comment for exactly why (`testConnection()`
 * mutates a non-`Ai*` model, and the normal RBAC write path requires a human `userId` AI-30's
 * hourly sweep doesn't have). **Every repair goes through `lib/aiRuntime/opsHealth/repairGate.ts`
 * first** — retry cap, exponential backoff, and "fails twice escalates, never retried again" are
 * enforced there, once, not per repair type. **No repair path here ever writes to a financial
 * record** (`Invoice`/`JournalEntry`/`Account`/etc.) — asserted directly via source-grep in this
 * workflow's own tests. Failed integrations are still detected and reported (`healthByIntegration`,
 * `issues[]`) — just not auto-repaired.
 */

const NOT_IMPLEMENTED = [
  {
    what: "relink_orphan",
    reason: "surveyed every real parent-child relationship in this schema (AiToolCall.runId, AiDecisionTrace.runId, AiEvent, AiSchedule) — none has a genuine dangling-reference-with-a-determinable-parent pattern; AiWorkflowRun-without-a-trace is a real, detected orphan but has no correct parent to relink to (the trace is missing, not misattached). The generic relink primitive (lib/aiRuntime/opsHealth/relinkOrphan.ts) is built and tested standalone, ready the moment a real case exists.",
  },
  {
    what: "retry_integration_connection",
    reason: 'the only re-runnable operation for a third-party connector, testConnection(), mutates and saves the Integration document (models/shared/Integration.ts) — not an Ai* model, so it cannot be an internal_state tool; the normal write path requires a real human userId (routePermissionCheck fails closed without one), which AI-30\'s autonomous "ai.sweep.hourly" trigger never has. No safe write path exists for this repair today (lib/aiRuntime/tools/opsHealthTools.ts).',
  },
];

interface Ai30Raw {
  triggered: boolean;
}

interface Ai30Extracted {
  stuckDrafts: Awaited<ReturnType<typeof findStuckDrafts>>;
  stuckApprovals: Awaited<ReturnType<typeof findStuckPendingApprovalJournals>>;
  stuckRuns: Awaited<ReturnType<typeof findStuckWorkflowRuns>>;
  stuckToolCalls: Awaited<ReturnType<typeof findStuckToolCalls>>;
  deadLetters: Awaited<ReturnType<typeof findDeadLetteredEvents>>;
  failedIntegrations: Awaited<ReturnType<typeof findFailedIntegrations>>;
  staleTaxProjections: Awaited<ReturnType<typeof findStaleTaxProjections>>;
  staleFxRates: Awaited<ReturnType<typeof findStaleFxRates>>;
  overdueSchedules: Awaited<ReturnType<typeof findOverdueSchedules>>;
  orphanRuns: Awaited<ReturnType<typeof findOrphanWorkflowRuns>>;
  duplicateExecutions: Awaited<ReturnType<typeof findDuplicateRunExecutions>>;
}

interface Ai30Issue {
  type: string;
  severity: string;
  subjectRef: { model: string; id: string };
  detail: string;
  repairable: boolean;
  repairType?: "requeue_dead_letter" | "refresh_tax_projection";
  repairArgs?: Record<string, unknown>;
}

interface Ai30Proposal {
  healthByModule: { module: string; issueCount: number }[];
  healthByIntegration: { integrationId: string; connectorId: string; status: "healthy" | "failing" }[];
  issues: Ai30Issue[];
  repairsAttempted: { issueKey: string; repairType: string; outcome: string }[];
  checksNotImplemented: typeof NOT_IMPLEMENTED;
}

export const ai30ErpOperations: WorkflowDefinition<Ai30Raw, Ai30Extracted, Ai30Proposal> = {
  id: "AI-30",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly"],
  actionClass: "erp_operations",
  defaultAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,

  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai30Raw>> {
    return { entityId: event.tenantId, raw: { triggered: true } };
  },

  async extract(observed, ctx): Promise<Ai30Extracted> {
    void observed;
    const tenantId = ctx.tenantId;
    const [stuckDrafts, stuckApprovals, stuckRuns, stuckToolCalls, deadLetters, failedIntegrations, staleTaxProjections, staleFxRates, overdueSchedules, orphanRuns, duplicateExecutions] = await Promise.all([
      findStuckDrafts(tenantId),
      findStuckPendingApprovalJournals(tenantId),
      findStuckWorkflowRuns(tenantId),
      findStuckToolCalls(tenantId),
      findDeadLetteredEvents(tenantId),
      findFailedIntegrations(tenantId),
      findStaleTaxProjections(tenantId),
      findStaleFxRates(tenantId),
      findOverdueSchedules(tenantId),
      findOrphanWorkflowRuns(tenantId),
      findDuplicateRunExecutions(tenantId),
    ]);
    return { stuckDrafts, stuckApprovals, stuckRuns, stuckToolCalls, deadLetters, failedIntegrations, staleTaxProjections, staleFxRates, overdueSchedules, orphanRuns, duplicateExecutions };
  },

  async reason(extracted): Promise<ReasonResult<Ai30Proposal>> {
    const issues: Ai30Issue[] = [];

    for (const d of extracted.stuckDrafts) issues.push({ type: "stuck_draft", severity: "medium", subjectRef: { model: d.model, id: d.id }, detail: `${d.detail} (${d.ageDays}d)`, repairable: false });
    for (const a of extracted.stuckApprovals) issues.push({ type: "stuck_pending_approval", severity: "medium", subjectRef: { model: a.model, id: a.id }, detail: `${a.detail} (${a.ageDays}d)`, repairable: false });
    for (const r of extracted.stuckRuns) issues.push({ type: "stuck_workflow_run", severity: "high", subjectRef: { model: r.model, id: r.id }, detail: r.detail, repairable: false });
    for (const t of extracted.stuckToolCalls) issues.push({ type: "stuck_tool_call", severity: "high", subjectRef: { model: t.model, id: t.id }, detail: t.detail, repairable: false });

    for (const g of extracted.deadLetters) {
      for (const eventId of g.eventIds) {
        issues.push({ type: "dead_lettered_event", severity: "medium", subjectRef: { model: "AiEvent", id: eventId }, detail: `${g.eventKey}: ${g.sampleError ?? "no error recorded"}`, repairable: true, repairType: "requeue_dead_letter", repairArgs: { eventId } });
      }
    }
    for (const f of extracted.failedIntegrations) {
      issues.push({ type: "failed_integration", severity: "high", subjectRef: { model: "Integration", id: f.integrationId }, detail: `${f.name} (${f.connectorId}): ${f.lastError ?? "unknown error"}`, repairable: false });
    }
    for (const p of extracted.staleTaxProjections) {
      issues.push({ type: "stale_tax_projection", severity: "medium", subjectRef: { model: "AiTaxTransaction", id: p.key }, detail: p.detail, repairable: true, repairType: "refresh_tax_projection", repairArgs: { period: p.key } });
    }
    for (const fx of extracted.staleFxRates) issues.push({ type: "stale_fx_rate", severity: "low", subjectRef: { model: "FxRate", id: fx.key }, detail: fx.detail, repairable: false });
    for (const s of extracted.overdueSchedules) issues.push({ type: "overdue_schedule", severity: "medium", subjectRef: { model: "AiSchedule", id: s.scheduleId }, detail: `${s.createdByWorkflow} schedule overdue by ${s.overdueDays}d`, repairable: false });
    for (const o of extracted.orphanRuns) issues.push({ type: "orphan_workflow_run", severity: "low", subjectRef: { model: "AiWorkflowRun", id: o.runId }, detail: `${o.workflowId} run (${o.status}) has no matching AiDecisionTrace`, repairable: false });
    for (const dup of extracted.duplicateExecutions) issues.push({ type: "duplicate_run_execution", severity: "medium", subjectRef: { model: "AiWorkflowRun", id: dup.runIds[1] }, detail: `${dup.workflowId} ran twice within a minute for the same entity (${dup.runIds.join(", ")})`, repairable: false });

    const byModule = new Map<string, number>();
    for (const i of issues) byModule.set(i.subjectRef.model, (byModule.get(i.subjectRef.model) ?? 0) + 1);
    const healthByModule = Array.from(byModule.entries()).map(([module, issueCount]) => ({ module, issueCount }));

    const healthByIntegration = extracted.failedIntegrations.map((f) => ({ integrationId: f.integrationId, connectorId: f.connectorId, status: "failing" as const }));

    const findings: ReasonResult<Ai30Proposal>["findings"] = issues.map((i) => ({
      id: `ai30-${i.type}-${i.subjectRef.id}`,
      type: AI_FINDING_TYPE.EXCEPTION,
      severity: i.severity === "high" ? AI_FINDING_SEVERITY.HIGH : i.severity === "medium" ? AI_FINDING_SEVERITY.MEDIUM : AI_FINDING_SEVERITY.LOW,
      title: `${i.type}: ${i.subjectRef.model} ${i.subjectRef.id}`,
      detail: i.detail,
      confidence: 1,
      subjectRefs: [i.subjectRef],
      evidence: [],
      reasonChain: [i.repairable ? "eligible for autonomous repair" : "needs a human — outside the 4 permitted repair types"],
    }));

    return {
      proposal: { healthByModule, healthByIntegration, issues, repairsAttempted: [], checksNotImplemented: NOT_IMPLEMENTED },
      confidence: 1,
      findings,
      reasonChain: [`${issues.length} issue(s) found, ${issues.filter((i) => i.repairable).length} eligible for autonomous repair`],
      // Real values, not a trusted default (defaultAutonomy is above DRAFT, so the gate's 7
      // checks run for real): a health sweep is never period-locked, and repairs are a system
      // action with no per-request human permission concept — both are genuinely `true` here,
      // not a placeholder.
      gateOverrides: { periodOpen: true, permissionOk: true },
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt): Promise<ActResult> {
    const tenantId = ctx.tenantId;
    const repairsAttempted: Ai30Proposal["repairsAttempted"] = [];

    // Kill switch, explicitly (A.5: "kill switch respected"). Internal_state tools bypass the
    // normal RBAC/permission check by design (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — but that
    // exemption exists for passive Ai*-only bookkeeping writes, not for AI-30's REPAIRS, which
    // have a real operational effect (an event re-queued, a projection rebuilt). The generic gate
    // (lib/aiRuntime/policy/autonomyGate.ts) drops `decision.autonomyApplied` below
    // CONTROLLED_AUTONOMOUS whenever any check — including kill_switch_enabled — fails, but never
    // sets `decision.allowed = false` for that (only NEVER_AUTONOMOUS does), so act() still runs.
    // AI-30 checks the applied level itself, here, before attempting any repair.
    const repairsPermitted = decision.autonomyApplied === AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS;

    for (const issue of reasoned.proposal.issues) {
      if (!issue.repairable || !issue.repairType) continue;
      if (!repairsPermitted) {
        repairsAttempted.push({ issueKey: `${issue.subjectRef.model}:${issue.subjectRef.id}`, repairType: issue.repairType, outcome: `skipped — autonomy dropped to ${decision.autonomyApplied} (${decision.reasons.join("; ")})` });
        continue;
      }
      const toolName = issue.repairType === "requeue_dead_letter" ? "requeue_dead_lettered_event" : "refresh_tax_projection";
      const result = await rt.callTool<{ repaired: boolean; reason?: string }>(
        toolName,
        { tenantId, ...issue.repairArgs },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS },
      );
      repairsAttempted.push({ issueKey: `${issue.subjectRef.model}:${issue.subjectRef.id}`, repairType: issue.repairType, outcome: result.repaired ? "success" : (result.reason ?? "not repaired") });
    }

    reasoned.proposal.repairsAttempted = repairsAttempted;

    await rt.callTool(
      "record_operations_findings",
      {
        tenantId,
        runId: rt.runId,
        healthByModule: reasoned.proposal.healthByModule,
        healthByIntegration: reasoned.proposal.healthByIntegration,
        issues: reasoned.proposal.issues,
        repairsAttempted,
      },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
    );

    return { findings: [], actionsTaken: repairsAttempted.map((r) => ({ tool: r.repairType, args: { issueKey: r.issueKey }, reversible: true })) };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

import { CONTROL_DEFINITIONS } from "@/lib/aiRuntime/controls/definitions";
import { runAllControlDefinitions } from "@/lib/aiRuntime/controls/engine";
import type { ControlRunResult } from "@/lib/aiRuntime/controls/types";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";
import { isWorkflowEnabled } from "@/lib/aiRuntime/runtime/killSwitch";

/**
 * AI-29 — Audit / control monitoring (docs/ai/BRIEF-07-BATCH-F.md). Internal controls tested
 * continuously via `lib/aiRuntime/controls/{types,engine,definitions}.ts` — the same
 * "one engine, many definitions" architecture that worked for AI-22's reconciliation controller.
 *
 * OBSERVE. Detection and task creation only — `record_control_result` and `create_task` are both
 * `internal_state`; no write tool anywhere touches a financial document. **Remediation cannot be
 * self-closed by the AI**: `create_task`'s own handler always resets a dedupe-matched
 * `AiAttentionItem` to OPEN on write (never CLOSED), so a control exception only clears when the
 * underlying condition clears on the NEXT run (the item is simply no longer regenerated) or a
 * human resolves it through the Attention tab — never because this workflow ran again with the
 * same data. The same dedupe mechanism is what makes a persistently-failing control raise its
 * `design_concern` task once, not once per run: a stable `dedupeKey` upserts the same
 * `AiAttentionItem` in place.
 *
 * **`overall_control_health` excludes `not_implemented` controls** — Part 9's false-completion
 * vector: a health score that silently treats "we never checked" as "it passed" is the single
 * worst thing this workflow could report.
 */

const DESIGN_CONCERN_FAILURE_RATE = 0.2;
const DESIGN_CONCERN_MIN_SAMPLE = 5;

// Same defect class fixed in AI-14/AI-25 (docs/ai/BRIEF-09-VERIFICATION.md Part B, "known defect
// class 2"): an unvalidated event.payload.period/periodStart/periodEnd on `period.horizon.reached`
// reaching Date.UTC()/`new Date()` as NaN/Invalid Date, then into a Mongoose Date-typed query
// inside runAllControlDefinitions() -> an uncaught cast exception instead of a clean degrade.
// Before this fix, observe() only guarded against a MISSING field (`event.payload.period ? ... :
// fallback`) — a present-but-malformed string (e.g. "garbage", "2026-13", "") still passed
// straight through as a literal Date string. Now: validate the period's shape and always DERIVE
// periodStart/periodEnd from the validated period, never trust a separately-supplied
// periodStart/periodEnd string (the real cron trigger doesn't even send periodStart today —
// app/api/cron/ai/runtime-sweep/route.ts only emits {period, periodEnd} — so trusting it was
// already dead weight, not a used feature).
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentPeriodString(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(period: string): { periodStart: Date; periodEnd: Date } {
  const [y, m] = period.split("-").map(Number);
  return { periodStart: new Date(Date.UTC(y, m - 1, 1)), periodEnd: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)) };
}

interface Ai29Raw {
  period: string;
  periodStart: string;
  periodEnd: string;
}

interface Ai29Extracted {
  period: string;
  results: ControlRunResult[];
}

interface Ai29ControlOutput extends ControlRunResult {
  designConcern: boolean;
}

interface Ai29Proposal {
  period: string;
  controls: Ai29ControlOutput[];
  overallControlHealth: number | null;
}

export const ai29ControlMonitoring: WorkflowDefinition<Ai29Raw, Ai29Extracted, Ai29Proposal> = {
  id: "AI-29",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  subscriptionFilter(): boolean {
    return true; // fan-out, same as AI-13/17/18/20/21/22/23
  },

  async observe(event): Promise<ObservedResult<Ai29Raw>> {
    const rawPeriod = event.payload.period;
    const period = typeof rawPeriod === "string" && PERIOD_PATTERN.test(rawPeriod) ? rawPeriod : currentPeriodString();
    const { periodStart, periodEnd } = periodBounds(period);
    return { entityId: event.tenantId, raw: { period, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() } };
  },

  async extract(observed, ctx): Promise<Ai29Extracted> {
    const results = await runAllControlDefinitions(ctx.tenantId, CONTROL_DEFINITIONS, new Date(observed.raw.periodStart), new Date(observed.raw.periodEnd));
    return { period: observed.raw.period, results };
  },

  async reason(extracted, ctx): Promise<ReasonResult<Ai29Proposal>> {
    // Same kill-switch check as act() below, and for the same reason: the
    // executor's own shared escalation step (lib/aiRuntime/runtime/executor.ts)
    // creates an AiAttentionItem for every EXCEPTION-type finding in
    // reasoned.findings regardless of what act() does — gating only act()
    // stops the tool-call writes but not this shared step, since it reads
    // straight from reason()'s output. Findings must never be raised for a
    // disabled workflow, not just never acted on.
    const enabled = await isWorkflowEnabled(ctx.tenantId, "AI-29");

    const findings: ReasonResult<Ai29Proposal>["findings"] = [];
    const controls: Ai29ControlOutput[] = [];

    for (const r of extracted.results) {
      const designConcern = r.status === "implemented" && r.tested >= DESIGN_CONCERN_MIN_SAMPLE && r.failureRate >= DESIGN_CONCERN_FAILURE_RATE;
      controls.push({ ...r, designConcern });

      if (!enabled) continue; // detection (controls[]) still runs; findings (which drive both act()'s tool calls AND the executor's own shared attention-item escalation) do not, when disabled.

      for (const exc of r.exceptions) {
        findings.push({
          id: `ai29-exception-${r.controlId}-${exc.ref}`,
          type: AI_FINDING_TYPE.EXCEPTION,
          severity: exc.severity === "critical" ? AI_FINDING_SEVERITY.CRITICAL : exc.severity === "high" ? AI_FINDING_SEVERITY.HIGH : exc.severity === "medium" ? AI_FINDING_SEVERITY.MEDIUM : AI_FINDING_SEVERITY.LOW,
          title: `Control exception: ${r.controlId}`,
          detail: exc.detail,
          confidence: 1,
          subjectRefs: [{ model: "JournalEntry", id: exc.ref }],
          evidence: exc.evidence,
          reasonChain: [],
        });
      }

      if (designConcern) {
        findings.push({
          id: `ai29-design-concern-${r.controlId}`,
          type: AI_FINDING_TYPE.ANOMALY,
          severity: AI_FINDING_SEVERITY.HIGH,
          title: `Control design concern: ${r.controlId}`,
          detail: `${r.description} is failing ${Math.round(r.failureRate * 100)}% of the time across ${r.tested} tested item(s) — this looks like a process design problem, not an isolated incident`,
          confidence: 1,
          subjectRefs: [],
          evidence: [],
          reasonChain: [],
        });
      }
    }

    const implementedOrPartial = controls.filter((c) => c.status !== "not_implemented");
    const overallControlHealth = implementedOrPartial.length === 0 ? null : implementedOrPartial.reduce((s, c) => s + (1 - c.failureRate), 0) / implementedOrPartial.length;

    return {
      proposal: { period: extracted.period, controls, overallControlHealth },
      confidence: 1,
      findings,
      reasonChain: [`${controls.filter((c) => c.status === "implemented").length} implemented control(s) tested, ${controls.filter((c) => c.status === "not_implemented").length} not_implemented (excluded from overall_control_health)`],
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    const tenantId = ctx.tenantId;

    // Bug fix (Phase 10 Part 1, root-caused against docs/admin/CRON_INCIDENT.md's
    // AI-runtime lead): this workflow's own file-header comment documents that its
    // OBSERVE-level act() still performs real internal_state writes
    // (record_control_result, create_task) — unlike the "OBSERVE means no side
    // effects at all" assumption lib/aiRuntime/runtime/eventBus.ts's dispatch gate
    // makes for autonomy levels at or below RECOMMEND (its `requiresValidation`
    // check exempts them from the kill switch entirely). That assumption doesn't
    // hold for THIS workflow, so it checks the kill switch itself rather than
    // relying on a gate that was never designed for a write-performing OBSERVE
    // workflow. Scoped to this one file rather than changing eventBus.ts's shared
    // gate for all ~30 workflows, most of which the exemption is correct for.
    if (!(await isWorkflowEnabled(tenantId, "AI-29"))) {
      return { findings: [], actionsTaken: [] };
    }

    for (const c of reasoned.proposal.controls) {
      await rt.callTool(
        "record_control_result",
        {
          tenantId,
          controlId: c.controlId,
          period: extracted.period,
          status: c.status,
          reasonIfLimited: c.reasonIfLimited,
          populationSize: c.populationSize,
          tested: c.tested,
          passed: c.passed,
          failed: c.failed,
          failureRate: c.failureRate,
          exceptions: c.exceptions,
          designConcern: c.designConcern,
        },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
      );

      // Bug fix (Phase 10 Part 1): this loop used to also call create_task for
      // every critical/high exception here — but lib/aiRuntime/runtime/
      // executor.ts's own generic escalation step ALREADY creates exactly one
      // AiAttentionItem for every EXCEPTION-type finding this workflow's
      // reason() returns (dedupeKey `${workflow.id}:${finding.id}`), for
      // every severity, not just critical/high. This explicit call used a
      // DIFFERENT dedupeKey format (no "AI-29:" prefix) for the SAME logical
      // exception, so the two never deduped against each other — a real
      // double-write, caught by a concurrent-dispatch test expecting exactly
      // one attention item per exception. Removed; the generic mechanism
      // already covers this (and covers medium/low severity too, which this
      // manual path silently never had).

      if (c.designConcern) {
        await rt.callTool(
          "create_task",
          {
            tenantId,
            workflowId: "AI-29",
            runId: rt.runId,
            priority: "high",
            what: `Control design concern: ${c.controlId} is failing ${Math.round(c.failureRate * 100)}% of the time`,
            why: `${c.description} — a persistent failure rate above ${Math.round(DESIGN_CONCERN_FAILURE_RATE * 100)}% suggests a process design problem, not an isolated incident`,
            dedupeKey: `ai29-design-concern-${c.controlId}`,
          },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
        );
      }
    }

    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

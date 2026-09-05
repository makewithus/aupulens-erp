import { CONTROL_DEFINITIONS } from "@/lib/aiRuntime/controls/definitions";
import { runAllControlDefinitions } from "@/lib/aiRuntime/controls/engine";
import type { ControlRunResult } from "@/lib/aiRuntime/controls/types";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

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
const MAX_EXCEPTION_TASKS_PER_CONTROL = 10;

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

  async reason(extracted): Promise<ReasonResult<Ai29Proposal>> {
    const findings: ReasonResult<Ai29Proposal>["findings"] = [];
    const controls: Ai29ControlOutput[] = [];

    for (const r of extracted.results) {
      const designConcern = r.status === "implemented" && r.tested >= DESIGN_CONCERN_MIN_SAMPLE && r.failureRate >= DESIGN_CONCERN_FAILURE_RATE;
      controls.push({ ...r, designConcern });

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

      for (const exc of c.exceptions.slice(0, MAX_EXCEPTION_TASKS_PER_CONTROL)) {
        if (exc.severity !== "critical" && exc.severity !== "high") continue;
        await rt.callTool(
          "create_task",
          {
            tenantId,
            workflowId: "AI-29",
            runId: rt.runId,
            priority: exc.severity === "critical" ? "critical" : "high",
            what: `Control exception: ${c.controlId} — ${exc.detail}`,
            why: c.description,
            dedupeKey: `ai29-exception-${c.controlId}-${exc.ref}`,
            evidence: exc.evidence,
          },
          { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
        );
      }

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

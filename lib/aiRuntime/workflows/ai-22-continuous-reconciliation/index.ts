import { runAllReconciliationDefinitions } from "@/lib/aiRuntime/reconciliation/engine";
import type { ReconciliationResult } from "@/lib/aiRuntime/reconciliation/types";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-22 — Continuous reconciliation controller (docs/ai/BRIEF-04-BATCH-C.md, build first — the
 * dependency every other Batch C workflow reads from). "One engine, many definitions": all the
 * real work lives in `lib/aiRuntime/reconciliation/` (engine.ts orchestrates, definitions.ts
 * holds each pair's population logic, classify.ts is the pure "reconciled is structurally
 * unreachable with an unexplained item" guard) — this workflow is a thin OBSERVE-level wrapper
 * that runs the engine and turns its output into findings.
 *
 * **OBSERVE only, never writes, never invokes another workflow** (A.3): the brief's own
 * algorithm section for AI-22 never asks it to trigger AI-03's matcher — that invoke-the-owner
 * pattern belongs to AI-13 (built next), which reads this same engine as one of many inputs
 * rather than depending on AI-22's own run output, so a stale AI-22 run can never make AI-13's
 * readiness look stale too.
 */

interface Ai22Raw {
  period: string;
  periodEnd: string;
}

interface Ai22Extracted {
  period: string;
  results: ReconciliationResult[];
}

interface Ai22Proposal {
  results: ReconciliationResult[];
}

function currentPeriod(): { period: string; periodEnd: Date } {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return { period, periodEnd };
}

export const ai22ContinuousReconciliation: WorkflowDefinition<Ai22Raw, Ai22Extracted, Ai22Proposal> = {
  id: "AI-22",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  // Both keys are fan-out (period.horizon.reached: shared with AI-13/24/28; ai.sweep.hourly:
  // shared with AI-03/07/09) — every subscriber wants every tick for its own domain, no single
  // owner (docs/ai/BRIEF-04-BATCH-C.md Part 0.2).
  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai22Raw>> {
    const fallback = currentPeriod();
    const period = event.payload.period ? String(event.payload.period) : fallback.period;
    const periodEnd = event.payload.periodEnd ? String(event.payload.periodEnd) : fallback.periodEnd.toISOString();
    return { entityId: event.tenantId, raw: { period, periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai22Extracted> {
    const results = await runAllReconciliationDefinitions(ctx.tenantId, new Date(observed.raw.periodEnd), observed.raw.period);
    return { period: observed.raw.period, results };
  },

  async reason(extracted): Promise<ReasonResult<Ai22Proposal>> {
    const reasonChain = [`ran ${extracted.results.length} reconciliation definition(s) for period ${extracted.period}`];
    const findings: ReasonResult<Ai22Proposal>["findings"] = [];

    for (const r of extracted.results) {
      if (r.status === "not_implemented") {
        reasonChain.push(`${r.definitionId}: not_implemented — ${r.notImplementedReason}`);
        continue;
      }
      if (r.status === "not_applicable") continue;
      if (r.status === "reconciled") continue;

      const severity = r.status === "unreconciled" ? (Math.abs(r.difference) > 10000 ? AI_FINDING_SEVERITY.HIGH : AI_FINDING_SEVERITY.MEDIUM) : AI_FINDING_SEVERITY.LOW;
      findings.push({
        id: `ai22-${r.definitionId}-${extracted.period}`,
        type: r.status === "unreconciled" ? AI_FINDING_TYPE.EXCEPTION : AI_FINDING_TYPE.EXPLANATION,
        severity,
        title: `${r.name}: ${r.status}`,
        detail: `left ${r.leftTotal} vs right ${r.rightTotal}, difference ${r.difference} (tolerance ${r.tolerance}, materiality_configured=${r.materialityConfigured}) — ${r.differences.length} difference(s), oldest ${r.oldestOpenItemDays}d`,
        amount: r.difference,
        confidence: 1,
        subjectRefs: [{ model: "ReconciliationDefinition", id: r.definitionId }],
        evidence: r.differences.flatMap((d) => d.evidence),
        reasonChain: [],
      });
    }

    return {
      proposal: { results: extracted.results },
      confidence: 1,
      findings,
      reasonChain,
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    // OBSERVE only — never writes, never invokes another workflow (see module doc comment).
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

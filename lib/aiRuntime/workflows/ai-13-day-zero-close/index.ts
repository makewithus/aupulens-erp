import { computeAndPersistCloseReadiness, type CloseReadinessComputation } from "@/lib/aiRuntime/closeReadiness/compute";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-13 — Day Zero Close (docs/ai/BRIEF-04-BATCH-C.md, built second). "Most of AI-13 is
 * aggregation of work already done" — all real computation lives in
 * `lib/aiRuntime/closeReadiness/` (domains.ts per-domain checks, classify.ts's pure severity/
 * readiness classifier, compute.ts's orchestrator); this workflow is a thin OBSERVE-level
 * wrapper that recomputes and persists to `AiCloseState`, then turns contradictions and hard
 * blockers into findings.
 *
 * **Never mutates `PeriodClosing`** (A.2 / Hard Rule 4) — `compute.ts` only ever reads it, to
 * detect a contradiction between the human-advanced status and the computed data. Proven by a
 * source-grep structural test, in the style of AI-09's Sales-boundary test.
 */

interface Ai13Raw {
  period: string;
  periodEnd: string;
}

interface Ai13Extracted {
  computation: CloseReadinessComputation;
}

interface Ai13Proposal {
  computation: CloseReadinessComputation;
}

function currentPeriod(): { period: string; periodEnd: Date } {
  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  return { period, periodEnd };
}

export const ai13DayZeroClose: WorkflowDefinition<Ai13Raw, Ai13Extracted, Ai13Proposal> = {
  id: "AI-13",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  // Fan-out, same as AI-22 (docs/ai/BRIEF-04-BATCH-C.md Part 0.2) — every subscriber recomputes
  // its own state on the same tick, no single owner of either event.
  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai13Raw>> {
    const fallback = currentPeriod();
    const period = event.payload.period ? String(event.payload.period) : fallback.period;
    const periodEnd = event.payload.periodEnd ? String(event.payload.periodEnd) : fallback.periodEnd.toISOString();
    return { entityId: event.tenantId, raw: { period, periodEnd } };
  },

  async extract(observed, ctx): Promise<Ai13Extracted> {
    const computation = await computeAndPersistCloseReadiness(ctx.tenantId, observed.raw.period, new Date(observed.raw.periodEnd));
    return { computation };
  },

  async reason(extracted): Promise<ReasonResult<Ai13Proposal>> {
    const { readiness, domains, contradictions, period } = extracted.computation;
    const reasonChain = [
      `readiness for ${period}: ${readiness.status} (score ${readiness.score}) — ${readiness.hardBlockers} hard, ${readiness.materialExceptions} material, ${readiness.minorExceptions} minor, ${readiness.staleItems} stale, ${readiness.domainsNotChecked} not checked`,
    ];
    const findings: ReasonResult<Ai13Proposal>["findings"] = [];

    for (const contradiction of contradictions) {
      findings.push({
        id: `ai13-contradiction-${contradiction.domain}-${period}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.CRITICAL,
        title: `PeriodClosing status contradicted by computed data (${contradiction.domain})`,
        detail: contradiction.detail,
        confidence: 1,
        subjectRefs: [{ model: "PeriodClosing", id: contradiction.domain }],
        evidence: [{ kind: "calculation" as const, ref: contradiction.domain, label: contradiction.machineEvidence.slice(0, 200) }],
        reasonChain: [],
      });
    }

    for (const domain of domains) {
      for (const blocker of domain.blockers) {
        if (blocker.severity !== "hard_blocker" && blocker.severity !== "material_exception") continue;
        findings.push({
          id: `ai13-${blocker.id}`,
          type: blocker.severity === "hard_blocker" ? AI_FINDING_TYPE.BLOCKER : AI_FINDING_TYPE.EXCEPTION,
          severity: blocker.severity === "hard_blocker" ? AI_FINDING_SEVERITY.HIGH : AI_FINDING_SEVERITY.MEDIUM,
          title: blocker.title,
          detail: blocker.detail,
          amount: blocker.amount,
          confidence: 1,
          subjectRefs: [{ model: "AiCloseState", id: `${domain.domain}:${blocker.id}` }],
          evidence: blocker.evidence,
          reasonChain: [],
        });
      }
    }

    return { proposal: { computation: extracted.computation }, confidence: 1, findings, reasonChain };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    // OBSERVE only. Auto-resolution already happened inside computeCloseReadiness() by
    // triggering the OWNING workflow's own event — never a direct write from AI-13 itself.
    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

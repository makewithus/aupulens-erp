import { computeComplianceReadiness, type ComplianceReadinessComputation } from "@/lib/aiRuntime/compliance/computeReadiness";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-17 — Compliance readiness (docs/ai/BRIEF-06-BATCH-E.md). "An obligation that first appears
 * at-risk three days before its deadline is a failure of this workflow" — a fully clean
 * obligation (reconciled, evidenced, no registration gap) already reports `at_risk` once its
 * deadline falls inside `warningWindowDays` (human-configured, defaulting generous — weeks, not
 * days), independent of any other problem; a real problem (unreconciled three-way, missing
 * evidence, an open registration gap) is always `blocked`, regardless of how much time is left —
 * see `lib/aiRuntime/compliance/computeReadiness.ts` for the exact classification.
 *
 * OBSERVE only, no tool calls — `computeReadiness.ts` does the same plain-read aggregation AI-13's
 * `closeReadiness/domains.ts` does, shared with AI-13's own new `compliance` domain so neither
 * computes a disagreeing answer.
 */

interface Ai17Raw {
  period: string;
}

interface Ai17Extracted {
  period: string;
  computation: ComplianceReadinessComputation;
}

interface Ai17Proposal {
  profileConfigured: boolean;
  obligations: ComplianceReadinessComputation["obligations"];
  registrationGaps: ComplianceReadinessComputation["registrationGaps"];
  submissionCapability: "not_implemented";
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const ai17ComplianceReadiness: WorkflowDefinition<Ai17Raw, Ai17Extracted, Ai17Proposal> = {
  id: "AI-17",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  subscriptionFilter(): boolean {
    return true; // fan-out, same as AI-13/AI-22
  },

  async observe(event): Promise<ObservedResult<Ai17Raw>> {
    const period = event.payload.period ? String(event.payload.period) : currentPeriod();
    return { entityId: event.tenantId, raw: { period } };
  },

  async extract(observed, ctx): Promise<Ai17Extracted> {
    const computation = await computeComplianceReadiness(ctx.tenantId, observed.raw.period);
    return { period: observed.raw.period, computation };
  },

  async reason(extracted): Promise<ReasonResult<Ai17Proposal>> {
    const { computation, period } = extracted;
    const findings: ReasonResult<Ai17Proposal>["findings"] = [];
    const reasonChain = [
      computation.profileConfigured
        ? `${computation.obligations.length} obligation(s) due for ${period}, ${computation.registrationGaps.length} registration gap(s)`
        : "no compliance profile configured — not_configured, zero obligations, no assumed default",
    ];

    computation.registrationGaps.forEach((gap, i) => {
      findings.push({
        id: `ai17-reggap-${gap.jurisdiction}-${gap.taxType}-${i}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: `Registration gap: ${gap.jurisdiction}/${gap.taxType}`,
        detail: gap.reason,
        confidence: 1,
        subjectRefs: [{ model: "AiComplianceProfile", id: `${gap.jurisdiction}:${gap.taxType}` }],
        evidence: [],
        reasonChain: [],
      });
    });

    for (const o of computation.obligations) {
      if (o.readiness === "ready") continue;
      const overdue = o.daysRemaining < 0;
      const severity = overdue
        ? AI_FINDING_SEVERITY.CRITICAL
        : o.readiness === "blocked"
          ? AI_FINDING_SEVERITY.HIGH
          : AI_FINDING_SEVERITY.MEDIUM;
      findings.push({
        id: `ai17-obligation-${o.jurisdiction}-${o.taxType}-${o.period}`,
        type: AI_FINDING_TYPE.EXCEPTION,
        severity,
        title: `${o.jurisdiction}/${o.returnType} obligation is ${o.readiness}${overdue ? " (overdue)" : ""}`,
        detail: o.blockers.join("; ") || "not yet ready",
        confidence: 1,
        subjectRefs: [{ model: "AiComplianceProfile", id: `${o.jurisdiction}:${o.taxType}:${o.period}` }],
        evidence: [],
        reasonChain: [`deadline ${o.deadline.toISOString().slice(0, 10)}, ${o.daysRemaining} day(s) remaining, warning window ${o.warningWindowDays} day(s)`],
      });
    }

    return {
      proposal: {
        profileConfigured: computation.profileConfigured,
        obligations: computation.obligations,
        registrationGaps: computation.registrationGaps,
        submissionCapability: "not_implemented",
      },
      confidence: 1,
      findings,
      reasonChain,
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    return { findings: [], actionsTaken: [] }; // OBSERVE only — no tool calls anywhere in this workflow
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

import { detectRelatedParties, type RelatedPartyMatch } from "@/lib/aiRuntime/relatedParty/detectRelatedParties";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-20 — Related-party detection (docs/ai/BRIEF-06-BATCH-E.md). Full group consolidation is
 * `not_implemented` — see `docs/ai/AI-20-ARCHITECTURE-NOTE.md` for why, and
 * `lib/aiRuntime/reconciliation/definitions.ts`'s `intercompany` entry for where that's recorded
 * with AI-22. This workflow is the part of AI-20 that *is* buildable within one tenant: does a
 * `Customer` record used in a sales role look like the same real-world entity as a different
 * `Customer` record used in a purchase role.
 *
 * OBSERVE, proposes nothing — no merge, no elimination, no write tool of any kind. `certain`
 * matches (shared tax registration/PAN) raise a HIGH finding; `probable` MEDIUM; `possible`
 * (name similarity alone) LOW — a human confirms, this workflow only surfaces the evidence.
 */

interface Ai20Raw {
  period?: string;
}

interface Ai20Extracted {
  matches: RelatedPartyMatch[];
}

interface Ai20Proposal {
  consolidation: { status: "not_implemented"; reason: string; memoRef: string };
  relatedParties: RelatedPartyMatch[];
}

const SEVERITY_BY_CLASSIFICATION = {
  certain: AI_FINDING_SEVERITY.HIGH,
  probable: AI_FINDING_SEVERITY.MEDIUM,
  possible: AI_FINDING_SEVERITY.LOW,
} as const;

export const ai20RelatedPartyDetection: WorkflowDefinition<Ai20Raw, Ai20Extracted, Ai20Proposal> = {
  id: "AI-20",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  subscriptionFilter(): boolean {
    return true; // fan-out, same as AI-13/AI-17/AI-21/AI-22
  },

  async observe(event): Promise<ObservedResult<Ai20Raw>> {
    return { entityId: event.tenantId, raw: { period: event.payload.period ? String(event.payload.period) : undefined } };
  },

  async extract(observed, ctx): Promise<Ai20Extracted> {
    const matches = await detectRelatedParties(ctx.tenantId);
    return { matches };
  },

  async reason(extracted): Promise<ReasonResult<Ai20Proposal>> {
    const findings: ReasonResult<Ai20Proposal>["findings"] = extracted.matches.map((m) => ({
      id: `ai20-related-party-${m.customerRef}-${m.vendorRef}`,
      type: AI_FINDING_TYPE.ANOMALY,
      severity: SEVERITY_BY_CLASSIFICATION[m.classification],
      title: `Possible related party (${m.classification}): matched on ${m.matchedOn.join(", ")}`,
      detail: `receivable ${m.receivableExposure}, payable ${m.payableExposure}, net ${m.net}`,
      amount: m.net,
      confidence: m.matchScore,
      subjectRefs: [
        { model: "Customer", id: m.customerRef },
        { model: "Customer", id: m.vendorRef },
      ],
      evidence: m.transactionRefs.map((ref) => ({ kind: "record" as const, ref, label: "Invoice" })),
      reasonChain: [],
    }));

    const reasonChain = [
      `${extracted.matches.length} candidate related-party pair(s) found`,
      `${extracted.matches.filter((m) => m.classification === "certain").length} certain, ${extracted.matches.filter((m) => m.classification === "probable").length} probable, ${extracted.matches.filter((m) => m.classification === "possible").length} possible`,
      "group consolidation itself is not_implemented — see docs/ai/AI-20-ARCHITECTURE-NOTE.md",
    ];

    return {
      proposal: {
        consolidation: {
          status: "not_implemented",
          reason: "group consolidation requires an entity model that does not exist — see docs/ai/AI-20-ARCHITECTURE-NOTE.md",
          memoRef: "docs/ai/AI-20-ARCHITECTURE-NOTE.md",
        },
        relatedParties: extracted.matches,
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
    return { findings: [], actionsTaken: [] }; // OBSERVE only — proposes/merges/eliminates nothing
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

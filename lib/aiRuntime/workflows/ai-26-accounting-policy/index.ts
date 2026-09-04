import connectDB from "@/lib/db";
import AiAccountingPolicy from "@/models/ai/AiAccountingPolicy";
import AiMaterialityPolicy, { findThreshold } from "@/models/ai/AiMaterialityPolicy";
import { collectInheritedPolicyGaps, type InheritedPolicyGap } from "@/lib/aiRuntime/policyIntelligence/inheritedGaps";
import { findCapitalizationInconsistencies, findUncoveredTransactionTypes, type TreatmentInconsistency, type PolicyGap } from "@/lib/aiRuntime/policyIntelligence/consistency";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-26 — Accounting policy intelligence (docs/ai/BRIEF-08a-BATCH-G.md). Keeps treatment
 * consistent: finds the transactions a policy touches, finds whether a policy governs an unusual
 * transaction, surfaces historical inconsistency. **It never changes a policy.**
 *
 * **`OBSERVE` only, no exceptions.** `record_accounting_policy` is `internal_state` (targets only
 * `models/ai/AiAccountingPolicy.ts`, never `AccountingSettings`/`lib/accounting/smart-rules.ts`)
 * — asserted directly via source-grep in this workflow's own test suite, same pattern as every
 * prior internal-state-only workflow.
 *
 * **Collects everything**: the six real, already-documented policy gaps from Chunks 3-5 (A.3),
 * each surfaced here with LIVE evidence queried from this tenant's own data
 * (`lib/aiRuntime/policyIntelligence/inheritedGaps.ts`) rather than the static text the brief
 * itself uses — plus a real consistency sweep (capitalisation treatment) and a live,
 * per-tenant "uncovered transaction type" scan across every action class that actually reads
 * `AiMaterialityPolicy` today.
 */

interface Ai26Raw {
  triggered: boolean;
}

interface Ai26Extracted {
  inheritedGaps: InheritedPolicyGap[];
  inconsistencies: TreatmentInconsistency[];
  uncoveredGaps: PolicyGap[];
  existingPolicies: { policyKey: string; source: string; statedTreatment: string; effectiveFrom: Date }[];
  capitalisationConfigured: boolean;
}

interface Ai26Proposal {
  policies: { policyKey: string; source: string; statedTreatment: string; coverageCount: number }[];
  treatmentVerdicts: { transactionRef: string; verdict: "consistent" | "inconsistent"; policyKey: string }[];
  inconsistencies: TreatmentInconsistency[];
  policyGaps: (InheritedPolicyGap | PolicyGap)[];
  impactOfChange: { policyKey: string; description: string; affectedCount: number; affectedValue: number }[];
}

export const ai26AccountingPolicy: WorkflowDefinition<Ai26Raw, Ai26Extracted, Ai26Proposal> = {
  id: "AI-26",
  version: "1.0.0",
  eventKeys: ["ai.sweep.hourly"],
  actionClass: "policy_intelligence",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  subscriptionFilter(): boolean {
    return true;
  },

  async observe(event): Promise<ObservedResult<Ai26Raw>> {
    return { entityId: event.tenantId, raw: { triggered: true } };
  },

  async extract(observed, ctx): Promise<Ai26Extracted> {
    void observed;
    await connectDB();
    const tenantId = ctx.tenantId;
    const [inheritedGaps, inconsistencies, uncoveredGaps, existingPolicyDocs, materialityPolicy] = await Promise.all([
      collectInheritedPolicyGaps(tenantId),
      findCapitalizationInconsistencies(tenantId),
      findUncoveredTransactionTypes(tenantId),
      AiAccountingPolicy.find({ tenantId }).lean(),
      AiMaterialityPolicy.findOne({ tenantId }).lean(),
    ]);
    const capThreshold = findThreshold(materialityPolicy as unknown as import("@/models/ai/AiMaterialityPolicy").IAiMaterialityPolicy | null, "capitalisation");

    return {
      inheritedGaps,
      inconsistencies,
      uncoveredGaps,
      existingPolicies: existingPolicyDocs.map((p) => ({ policyKey: p.policyKey, source: p.source, statedTreatment: p.statedTreatment, effectiveFrom: p.effectiveFrom })),
      capitalisationConfigured: Boolean(capThreshold?.absoluteAmount),
    };
  },

  async reason(extracted): Promise<ReasonResult<Ai26Proposal>> {
    const findings: ReasonResult<Ai26Proposal>["findings"] = [];

    const treatmentVerdicts: Ai26Proposal["treatmentVerdicts"] = [];
    for (const inc of extracted.inconsistencies) {
      for (const ex of inc.treatmentA.examples) treatmentVerdicts.push({ transactionRef: ex.ref, verdict: "consistent", policyKey: "capitalisation" });
      for (const ex of inc.treatmentB.examples) treatmentVerdicts.push({ transactionRef: ex.ref, verdict: "inconsistent", policyKey: "capitalisation" });

      findings.push({
        id: `ai26-inconsistency-${inc.pattern.replace(/\s+/g, "-")}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.HIGH,
        title: `Inconsistent treatment: ${inc.pattern}`,
        detail: `${inc.treatmentA.examples.length} treated one way, ${inc.treatmentB.examples.length} treated another — ₹${inc.value} at issue. Examples: ${[...inc.treatmentA.examples, ...inc.treatmentB.examples].map((e) => e.detail).join("; ")}`,
        amount: inc.value,
        confidence: 1,
        subjectRefs: [...inc.treatmentA.examples, ...inc.treatmentB.examples].map((e) => ({ model: "Invoice", id: e.ref })),
        evidence: [...inc.treatmentA.examples, ...inc.treatmentB.examples].map((e) => ({ kind: "record" as const, ref: e.ref, label: e.detail })),
        reasonChain: [],
      });
    }

    const policyGaps: Ai26Proposal["policyGaps"] = [...extracted.inheritedGaps, ...extracted.uncoveredGaps];
    for (const g of policyGaps) {
      findings.push({
        id: `ai26-gap-${g.gap.replace(/\s+/g, "-").slice(0, 60)}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.LOW,
        title: `Policy gap: ${g.gap}`,
        detail: `${g.evidence} — impact: ${g.impactEstimate} (inherited from ${g.inheritedFrom})`,
        confidence: 1,
        subjectRefs: [],
        evidence: [],
        reasonChain: [],
      });
    }

    const impactOfChange: Ai26Proposal["impactOfChange"] = extracted.inconsistencies.map((inc) => ({
      policyKey: "capitalisation",
      description: `if the capitalisation policy were enforced consistently, ${inc.treatmentB.examples.length} past bill(s) would be reclassified from expense to asset_fixed`,
      affectedCount: inc.treatmentB.examples.length,
      affectedValue: inc.value,
    }));

    const policies: Ai26Proposal["policies"] = extracted.existingPolicies.map((p) => ({ policyKey: p.policyKey, source: p.source, statedTreatment: p.statedTreatment, coverageCount: 0 }));

    return {
      proposal: { policies, treatmentVerdicts, inconsistencies: extracted.inconsistencies, policyGaps, impactOfChange },
      confidence: 1,
      findings,
      reasonChain: [`${extracted.inheritedGaps.length} inherited gap(s), ${extracted.uncoveredGaps.length} uncovered transaction type(s), ${extracted.inconsistencies.length} inconsistency pattern(s)`],
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(reasoned, ctx, decision, rt, extracted): Promise<ActResult> {
    void decision;
    const tenantId = ctx.tenantId;

    // Only ever writes the observed/configured POLICY REGISTRY (models/ai/AiAccountingPolicy.ts)
    // — never AccountingSettings, never smart-rules.ts.
    if (extracted.capitalisationConfigured && extracted.inconsistencies.length === 0) {
      await rt.callTool(
        "record_accounting_policy",
        { tenantId, policyKey: "capitalisation", scopeConditions: {}, statedTreatment: "capitalise purchases above the configured threshold", effectiveFrom: new Date().toISOString(), source: "observed" },
        { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
      );
    }

    await rt.callTool(
      "record_policy_findings",
      {
        tenantId,
        runId: rt.runId,
        policies: reasoned.proposal.policies,
        treatmentVerdicts: reasoned.proposal.treatmentVerdicts,
        inconsistencies: reasoned.proposal.inconsistencies,
        policyGaps: reasoned.proposal.policyGaps,
        impactOfChange: reasoned.proposal.impactOfChange,
      },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE },
    );

    return { findings: [], actionsTaken: [] };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

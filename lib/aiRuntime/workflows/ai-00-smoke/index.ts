import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type {
  WorkflowDefinition,
  ObservedResult,
  ReasonResult,
  ActResult,
  VerifyResult,
} from "@/lib/aiRuntime/workflows/types";

/**
 * AI-00-SMOKE — the trivial demo workflow required by the Build Order Phase 1
 * gate: "a trivial demo workflow runs end-to-end through all 10 stages with a
 * full audit record." Not a real business workflow — proves the runtime
 * works before any AI-XX is built on it (docs/ai/FOUNDATION-plan.md).
 *
 * Always OBSERVE: never proposes or takes a real action, so it exercises the
 * gate's zero-check OBSERVE/RECOMMEND path and the tool layer (via a single
 * read-only check_permission call in act()) without ever needing real
 * period/permission/materiality data.
 */

interface SmokeRaw {
  message: string;
}

interface SmokeExtracted {
  message: string;
}

interface SmokeProposal {
  finding: string;
}

export const aiSmokeWorkflow: WorkflowDefinition<SmokeRaw, SmokeExtracted, SmokeProposal> = {
  id: "AI-00-SMOKE",
  version: "1.0.0",
  eventKeys: ["ai.smoke.ping"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  async observe(event): Promise<ObservedResult<SmokeRaw>> {
    const message = typeof event.payload.message === "string" ? event.payload.message : "ping";
    return { entityId: event.tenantId, raw: { message } };
  },

  async extract(observed): Promise<SmokeExtracted> {
    return { message: observed.raw.message };
  },

  async reason(extracted, ctx): Promise<ReasonResult<SmokeProposal>> {
    return {
      proposal: { finding: "smoke test ok" },
      confidence: 1,
      confidenceComponents: { fixed: 1 },
      findings: [
        {
          id: "smoke-1",
          type: AI_FINDING_TYPE.EXPLANATION,
          severity: AI_FINDING_SEVERITY.INFO,
          title: "AI runtime smoke test",
          detail: `Received "${extracted.message}" for tenant ${ctx.tenantId}`,
          confidence: 1,
          subjectRefs: [],
          evidence: [],
          reasonChain: [],
        },
      ],
      reasonChain: [`observed message "${extracted.message}"`, "no real model call — deterministic smoke fixture"],
    };
  },

  async validate() {
    return { valid: true };
  },

  async act(_reasoned, ctx, _decision, rt, _extracted): Promise<ActResult> {
    await rt.callTool(
      "check_permission",
      { tenantId: ctx.tenantId, module: "admin", action: "ai.smoke.run" },
      { requestedAutonomy: AI_AUTONOMY_LEVEL.OBSERVE },
    );
    return { findings: [], actionsTaken: [], metrics: { scanned: 1 } };
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

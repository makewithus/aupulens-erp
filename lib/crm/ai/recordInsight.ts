/**
 * Persists a real LLM-generated insight to CrmAIInsight (Phase 2).
 *
 * Before this, nothing in the codebase ever wrote to this collection — the
 * `/crm/ai` "AI Intelligence Inbox" page read from it but showed "No active
 * insights. System is optimal." forever, on every tenant. Every genuinely
 * LLM-backed CRM feature that produces a worthwhile insight should call this
 * so that page actually reflects real analysis.
 *
 * Only call this with an `ok: true` LlmInsightResult — there's nothing
 * meaningful to log for a gated/failed AI call (the caller already fell back
 * to the deterministic engine in that case).
 */
import dbConnect from "@/lib/db";
import CrmAIInsight from "@/models/crm/AIInsight";
import type { LlmInsightResult } from "@/lib/crm/ai/llmInsight";

export type CrmInsightType = "Risk" | "Recommendation" | "Data Quality" | "Duplicate" | "Churn";

export async function recordAiInsight(params: {
  tenantId: string;
  entityType: string;
  entityId: string;
  insightType: CrmInsightType;
  insight: LlmInsightResult;
  /** Override the severity derived from insight.riskLevel — useful when riskLevel doesn't map 1:1 (e.g. a lead-score insight isn't a "risk"). */
  severity?: "Low" | "Medium" | "High" | "Critical";
}): Promise<void> {
  await dbConnect();
  await CrmAIInsight.create({
    tenantId: params.tenantId,
    entityType: params.entityType,
    entityId: params.entityId,
    insightType: params.insightType,
    severity: params.severity || params.insight.riskLevel || "Low",
    confidence: params.insight.confidence,
    title: params.insight.summary || `AI ${params.insightType.toLowerCase()} insight`,
    description: params.insight.reasoning,
    recommendedAction: params.insight.suggestedAction,
  });
}

import { getLlmCrmInsight, type LlmInsightOutcome } from "@/lib/crm/ai/llmInsight";

export interface NextBestActionSuggestion {
  action: string;
  reason: string;
  priority: string;
  confidence: number;
}

/**
 * Deterministic fallback — used when AI is disabled/over-cap/unavailable.
 * Kept as the safety net so this always returns *something* useful.
 *
 * The "Account" branch was added here (previously missing entirely — the
 * audit found the one real call site, app/api/crm/accounts/[id]/route.ts,
 * passed entityType "Account" and always silently fell through to the
 * generic default regardless of account state, since no case handled it).
 */
export function determineNextBestAction(entityType: string, payload: any): NextBestActionSuggestion[] {
  const actions: NextBestActionSuggestion[] = [];

  if (entityType === "Opportunity") {
    if (payload.stage === "Proposal") {
      actions.push({ action: "Follow Up Customer", reason: "Proposal sent, awaiting response", priority: "High", confidence: 90 });
    } else if (payload.amount > 100000) {
      actions.push({ action: "Escalate Opportunity", reason: "High value deal, assign VP", priority: "Critical", confidence: 95 });
    } else if (payload.stage === "Discovery") {
      actions.push({ action: "Schedule Demo", reason: "Discovery complete", priority: "Medium", confidence: 80 });
    }
  } else if (entityType === "Lead") {
    if (payload.status === "New") {
      actions.push({ action: "Send Proposal", reason: "New high-score lead", priority: "High", confidence: 85 });
    }
  } else if (entityType === "Contract") {
    const daysToExpiry = payload.end_date ? (new Date(payload.end_date).getTime() - Date.now()) / 86400000 : 999;
    if (daysToExpiry < 60 && payload.status === "Active") {
      actions.push({ action: "Create Renewal Task", reason: `Contract expires in ${Math.floor(daysToExpiry)} days`, priority: "High", confidence: 95 });
      actions.push({ action: "Create Upsell Opportunity", reason: "Good time to discuss expansion", priority: "Medium", confidence: 70 });
    }
  } else if (entityType === "Account") {
    if (payload.churn_risk === "Critical" || payload.churn_risk === "High") {
      actions.push({ action: "Schedule Retention Call", reason: `Account churn risk is ${payload.churn_risk}`, priority: "Critical", confidence: 90 });
    } else if (payload.status === "At Risk") {
      actions.push({ action: "Assign Customer Success Check-in", reason: "Account flagged At Risk", priority: "High", confidence: 80 });
    }
  }

  // Default fallback
  if (actions.length === 0) {
    actions.push({ action: "Re-engage Lead", reason: "Maintain relationship", priority: "Low", confidence: 60 });
  }

  return actions;
}

export interface NextBestActionAiResult {
  actions: NextBestActionSuggestion[];
  suggestedFollowUpMessage?: string;
  insight: LlmInsightOutcome;
}

/**
 * Real, LLM-backed next-best-action + suggested follow-up message.
 * Falls back to determineNextBestAction() (deterministic) when AI is
 * gated/unavailable — never returns nothing.
 */
export async function getNextBestActionWithAi(
  tenantId: string,
  entityType: string,
  payload: any
): Promise<NextBestActionAiResult> {
  const insight = await getLlmCrmInsight(
    tenantId,
    `Given this ${entityType} record, recommend the single most valuable next action a rep should take right now. ` +
      `Also draft a short, ready-to-send follow-up message (2-3 sentences, professional tone) appropriate to its ` +
      `current state — use the draftMessage field for this.`,
    JSON.stringify(payload)
  );

  if (insight.ok) {
    const priority =
      insight.riskLevel === "Critical" ? "Critical" : insight.riskLevel === "High" ? "High" : insight.riskLevel === "Medium" ? "Medium" : "Low";
    return {
      actions: [
        {
          action: insight.suggestedAction || insight.summary || "Review record",
          reason: insight.reasoning,
          priority,
          confidence: insight.confidence,
        },
      ],
      suggestedFollowUpMessage: insight.draftMessage,
      insight,
    };
  }

  return { actions: determineNextBestAction(entityType, payload), insight };
}

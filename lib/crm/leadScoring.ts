import { getLlmCrmInsight, type LlmInsightOutcome } from "@/lib/crm/ai/llmInsight";

/**
 * Deterministic fallback score — used when the LLM is disabled, over its
 * monthly cap, or fails for any other reason. Kept exactly as it was before
 * the Phase 2 AI migration so a workspace without AI configured still scores
 * leads exactly as it always has.
 */
export function calculateLeadScore(lead: any): number {
  let score = 0;
  if (lead.company_name) score += 10;
  if (lead.budget_range) score += 15;
  if (lead.source === 'Referral' || lead.source === 'Event') score += 15;
  else if (lead.source === 'Paid Ads') score += 10;
  else if (lead.source === 'Organic Search') score += 8;
  if (lead.notes) score += 5;
  if (lead.email && lead.phone) score += 5;
  // decision_maker logic applied during update
  return Math.min(score, 100);
}

export interface AiLeadScoreResult {
  score: number;
  insight: LlmInsightOutcome;
}

/**
 * Real, LLM-backed lead scoring. Returns a numeric score (from the model
 * when available, from calculateLeadScore() when not) plus the raw insight
 * outcome so the caller can decide whether to persist a CrmAIInsight record
 * (only worth doing when the LLM actually ran — no insight to log when we
 * silently fell back to the deterministic score).
 */
export async function scoreLeadWithAi(tenantId: string, lead: any): Promise<AiLeadScoreResult> {
  const insight = await getLlmCrmInsight(
    tenantId,
    "Score this sales lead's likelihood to convert into a paying customer, 0-100 " +
      "(higher = more likely to convert). Weigh company/budget presence, lead source " +
      "quality, completeness of contact info, and any notes provided.",
    JSON.stringify({
      lead_name: lead.lead_name,
      company_name: lead.company_name,
      source: lead.source,
      budget_range: lead.budget_range,
      expected_timeline: lead.expected_timeline,
      notes: lead.notes,
      has_email: !!lead.email,
      has_phone: !!lead.phone,
      status: lead.status,
    })
  );

  if (insight.ok && insight.score !== undefined) {
    return { score: insight.score, insight };
  }
  return { score: calculateLeadScore(lead), insight };
}

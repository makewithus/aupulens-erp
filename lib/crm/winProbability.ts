import { getLlmCrmInsight, type LlmInsightOutcome } from "@/lib/crm/ai/llmInsight";

/**
 * Deterministic win-probability fallback — used when the LLM is disabled, over
 * its monthly cap, or fails. A stage-anchored baseline nudged by the deal's own
 * stored probability field, so a workspace without AI still gets a sensible,
 * predictable number (never nothing). Mirrors the leadScoring.ts fallback
 * pattern (Native ERP AI functionality #7, "win probability").
 */
const STAGE_BASELINE: Record<string, number> = {
  Prospecting: 10,
  Discovery: 20,
  "Requirement Gathering": 35,
  "Solution Fit": 50,
  "Proposal Sent": 60,
  Negotiation: 75,
  Approval: 90,
  "Closed Won": 100,
  "Closed Lost": 0,
};

export function calculateWinProbability(opp: any): number {
  const stage: string = opp?.stage ?? "Prospecting";
  if (stage === "Closed Won") return 100;
  if (stage === "Closed Lost") return 0;

  const baseline = STAGE_BASELINE[stage] ?? 25;
  // Blend the stage baseline with any rep-entered probability (equal weight)
  // when present, so both signals count without either dominating.
  const stored = typeof opp?.probability === "number" ? opp.probability : undefined;
  let prob = stored !== undefined ? Math.round((baseline + stored) / 2) : baseline;

  // Overdue expected close date is a negative signal.
  if (opp?.expected_close_date && new Date(opp.expected_close_date) < new Date()) {
    prob = Math.max(0, prob - 15);
  }
  return Math.max(0, Math.min(100, prob));
}

export interface AiWinProbabilityResult {
  probability: number;
  insight: LlmInsightOutcome;
}

/**
 * Real, LLM-backed win-probability estimate (0-100). Returns the model's
 * estimate when available, the deterministic calculateWinProbability() when
 * not — never nothing. Caller decides whether to persist a CrmAIInsight (only
 * meaningful when the LLM actually ran).
 */
export async function estimateWinProbabilityWithAi(
  tenantId: string,
  opp: any
): Promise<AiWinProbabilityResult> {
  const insight = await getLlmCrmInsight(
    tenantId,
    "Estimate the probability (0-100) that this sales opportunity will be won " +
      "(reach Closed Won). Weigh the current stage, how long it has sat in that " +
      "stage, deal amount vs. typical, stakeholder coverage, and proximity to / " +
      "slippage past the expected close date. Return the probability in the score field.",
    JSON.stringify({
      deal_name: opp?.deal_name,
      stage: opp?.stage,
      amount: opp?.amount,
      stored_probability: opp?.probability,
      expected_close_date: opp?.expected_close_date,
      stage_entered_at: opp?.stage_entered_at,
      stakeholder_count: opp?.stakeholders?.length ?? 0,
    })
  );

  if (insight.ok && insight.score !== undefined) {
    return { probability: insight.score, insight };
  }
  return { probability: calculateWinProbability(opp), insight };
}

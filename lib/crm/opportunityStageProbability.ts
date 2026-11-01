/** One probability per pipeline stage keeps forecasts consistent across views. */
export const OPPORTUNITY_STAGE_PROBABILITY: Readonly<Record<string, number>> = {
  Prospecting: 10,
  Discovery: 20,
  "Requirement Gathering": 35,
  "Solution Fit": 50,
  "Proposal Sent": 65,
  Negotiation: 80,
  Approval: 90,
  "Closed Won": 100,
  "Closed Lost": 0,
};

export function probabilityForOpportunityStage(stage: string, fallback = 10): number {
  return OPPORTUNITY_STAGE_PROBABILITY[stage] ?? fallback;
}

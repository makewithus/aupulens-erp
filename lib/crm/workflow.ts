export const LEAD_STATUS = {
  NEW: "new",
  CONTACTED: "contacted",
  QUALIFIED: "qualified",
  DISQUALIFIED: "disqualified",
  CONVERTED: "converted",
} as const;

export const LEAD_STATUS_VALUES = Object.values(LEAD_STATUS);
export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

export const LEAD_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LEAD_STATUS.NEW]: [
    LEAD_STATUS.CONTACTED,
    LEAD_STATUS.QUALIFIED,
    LEAD_STATUS.DISQUALIFIED,
  ],
  [LEAD_STATUS.CONTACTED]: [
    LEAD_STATUS.QUALIFIED,
    LEAD_STATUS.DISQUALIFIED,
  ],
  [LEAD_STATUS.QUALIFIED]: [
    LEAD_STATUS.CONVERTED,
    LEAD_STATUS.DISQUALIFIED,
  ],
  [LEAD_STATUS.DISQUALIFIED]: [LEAD_STATUS.NEW],
  [LEAD_STATUS.CONVERTED]: [],
};

export const OPPORTUNITY_STAGE = {
  QUALIFICATION: "qualification",
  PROPOSAL: "proposal",
  NEGOTIATION: "negotiation",
  WON: "won",
  LOST: "lost",
} as const;

export const OPPORTUNITY_STAGE_VALUES = Object.values(OPPORTUNITY_STAGE);
export type OpportunityStage =
  (typeof OPPORTUNITY_STAGE)[keyof typeof OPPORTUNITY_STAGE];

export const OPPORTUNITY_STAGE_TRANSITIONS: Record<
  OpportunityStage,
  OpportunityStage[]
> = {
  [OPPORTUNITY_STAGE.QUALIFICATION]: [
    OPPORTUNITY_STAGE.PROPOSAL,
    OPPORTUNITY_STAGE.LOST,
  ],
  [OPPORTUNITY_STAGE.PROPOSAL]: [
    OPPORTUNITY_STAGE.NEGOTIATION,
    OPPORTUNITY_STAGE.WON,
    OPPORTUNITY_STAGE.LOST,
  ],
  [OPPORTUNITY_STAGE.NEGOTIATION]: [
    OPPORTUNITY_STAGE.WON,
    OPPORTUNITY_STAGE.LOST,
  ],
  [OPPORTUNITY_STAGE.WON]: [],
  [OPPORTUNITY_STAGE.LOST]: [OPPORTUNITY_STAGE.QUALIFICATION],
};

export function isValidLeadTransition(
  current: LeadStatus,
  next: LeadStatus,
) {
  return current === next || LEAD_STATUS_TRANSITIONS[current]?.includes(next);
}

export function isValidOpportunityTransition(
  current: OpportunityStage,
  next: OpportunityStage,
) {
  return (
    current === next || OPPORTUNITY_STAGE_TRANSITIONS[current]?.includes(next)
  );
}

export function normalizeProbability(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, numeric));
}

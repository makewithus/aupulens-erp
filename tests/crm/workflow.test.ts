import { describe, expect, it } from "vitest";
import {
  LEAD_STATUS,
  OPPORTUNITY_STAGE,
  isValidLeadTransition,
  isValidOpportunityTransition,
  normalizeProbability,
} from "@/lib/crm/workflow";

describe("crm workflow transitions", () => {
  it("allows lead qualification and conversion from qualified", () => {
    expect(
      isValidLeadTransition(LEAD_STATUS.NEW, LEAD_STATUS.QUALIFIED),
    ).toBe(true);
    expect(
      isValidLeadTransition(LEAD_STATUS.QUALIFIED, LEAD_STATUS.CONVERTED),
    ).toBe(true);
  });

  it("blocks converting disqualified leads directly", () => {
    expect(
      isValidLeadTransition(LEAD_STATUS.DISQUALIFIED, LEAD_STATUS.CONVERTED),
    ).toBe(false);
  });

  it("allows normal opportunity progression to won", () => {
    expect(
      isValidOpportunityTransition(
        OPPORTUNITY_STAGE.QUALIFICATION,
        OPPORTUNITY_STAGE.PROPOSAL,
      ),
    ).toBe(true);
    expect(
      isValidOpportunityTransition(
        OPPORTUNITY_STAGE.PROPOSAL,
        OPPORTUNITY_STAGE.NEGOTIATION,
      ),
    ).toBe(true);
    expect(
      isValidOpportunityTransition(
        OPPORTUNITY_STAGE.NEGOTIATION,
        OPPORTUNITY_STAGE.WON,
      ),
    ).toBe(true);
  });

  it("clamps probabilities between zero and one hundred", () => {
    expect(normalizeProbability(-20)).toBe(0);
    expect(normalizeProbability(45)).toBe(45);
    expect(normalizeProbability(150)).toBe(100);
    expect(normalizeProbability("not-a-number", 30)).toBe(30);
  });
});

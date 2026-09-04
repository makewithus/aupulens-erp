import { describe, expect, it } from "vitest";
import { decideAutonomy } from "@/lib/aiRuntime/policy/autonomyGate";
import { AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import type { ContextBundle } from "@/lib/aiRuntime/context/contextService";

const policy: ContextBundle["policy"] = {
  workflowId: "AI-TEST",
  maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
  killSwitchEnabled: true,
  confidenceThreshold: 0.85,
  materialityThreshold: 1000,
  historicalStabilityThreshold: 0.9,
  autoPostSchedules: false,
};

const basePassingInput = {
  actionClass: "journal_posting",
  requestedAutonomy: AI_AUTONOMY_LEVEL.EXECUTE,
  confidence: 0.95,
  amount: 100,
  historicalStability: 0.95,
  periodOpen: true,
  permissionOk: true,
  policy,
};

describe("decideAutonomy — the shared gate", () => {
  it("allows the requested level when every check passes", () => {
    const decision = decideAutonomy(basePassingInput);
    expect(decision.allowed).toBe(true);
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.EXECUTE);
    expect(decision.escalate).toBe(false);
  });

  it("NEVER_AUTONOMOUS action classes are always rejected regardless of confidence/policy", () => {
    const decision = decideAutonomy({
      ...basePassingInput,
      actionClass: "release_payment",
      confidence: 1,
      policy: { ...policy, killSwitchEnabled: true, confidenceThreshold: 0 },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.NEVER_AUTONOMOUS);
    expect(decision.escalate).toBe(true);
  });

  it("every NEVER_AUTONOMOUS action class from Hard Rule 4 is rejected", () => {
    const classes = [
      "release_payment",
      "change_vendor_bank_details",
      "submit_statutory_filing",
      "change_tax_rule",
      "change_accounting_rule",
      "close_period",
      "lock_period",
    ];
    for (const actionClass of classes) {
      const decision = decideAutonomy({ ...basePassingInput, actionClass });
      expect(decision.allowed, actionClass).toBe(false);
      expect(decision.autonomyApplied, actionClass).toBe(AI_AUTONOMY_LEVEL.NEVER_AUTONOMOUS);
    }
  });

  it("OBSERVE and RECOMMEND require no gate at all — allowed even with terrible inputs", () => {
    for (const level of [AI_AUTONOMY_LEVEL.OBSERVE, AI_AUTONOMY_LEVEL.RECOMMEND]) {
      const decision = decideAutonomy({
        ...basePassingInput,
        requestedAutonomy: level,
        confidence: 0,
        periodOpen: false,
        permissionOk: false,
        policy: { ...policy, killSwitchEnabled: false },
      });
      expect(decision.allowed).toBe(true);
      expect(decision.autonomyApplied).toBe(level);
      expect(decision.escalate).toBe(false);
    }
  });

  it("low confidence drops to RECOMMEND and escalates", () => {
    const decision = decideAutonomy({ ...basePassingInput, confidence: 0.1 });
    expect(decision.allowed).toBe(true);
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    expect(decision.escalate).toBe(true);
    expect(decision.reasons.join(" ")).toContain("confidence");
  });

  it("amount over materiality drops to RECOMMEND and escalates", () => {
    const decision = decideAutonomy({ ...basePassingInput, amount: 5000 });
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    expect(decision.escalate).toBe(true);
  });

  it("low historical stability drops to RECOMMEND and escalates", () => {
    const decision = decideAutonomy({ ...basePassingInput, historicalStability: 0.1 });
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    expect(decision.escalate).toBe(true);
  });

  it("a locked period drops to RECOMMEND and escalates", () => {
    const decision = decideAutonomy({ ...basePassingInput, periodOpen: false });
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    expect(decision.escalate).toBe(true);
  });

  it("missing permission drops to RECOMMEND and escalates", () => {
    const decision = decideAutonomy({ ...basePassingInput, permissionOk: false });
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    expect(decision.escalate).toBe(true);
  });

  it("kill switch off (default, unvalidated) drops to RECOMMEND and escalates", () => {
    const decision = decideAutonomy({
      ...basePassingInput,
      policy: { ...policy, killSwitchEnabled: false },
    });
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    expect(decision.escalate).toBe(true);
  });

  it("missing materiality threshold does not block (nothing to compare against)", () => {
    const decision = decideAutonomy({
      ...basePassingInput,
      amount: 999999,
      policy: { ...policy, materialityThreshold: undefined },
    });
    expect(decision.allowed).toBe(true);
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.EXECUTE);
  });

  it("no historical data yet does not block (undefined treated as no signal, not failure)", () => {
    const decision = decideAutonomy({ ...basePassingInput, historicalStability: undefined });
    expect(decision.allowed).toBe(true);
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.EXECUTE);
  });

  it("tenant policy explicitly forbidding the action drops to RECOMMEND", () => {
    const decision = decideAutonomy({ ...basePassingInput, policyAllowsAction: false });
    expect(decision.autonomyApplied).toBe(AI_AUTONOMY_LEVEL.RECOMMEND);
    expect(decision.escalate).toBe(true);
  });
});

/**
 * NL-to-rule validation tests (Scope D).
 *
 * The safety property that matters: the model's output is coerced/filtered to
 * the automation engine's ACTUAL vocabulary, so a hallucinated trigger/entity/
 * operator/action can never be persisted as a dead or dangerous rule. The live
 * end-to-end (parse → save → engine executes) is covered by
 * scripts/verify-nl-rule.ts against real gpt-4o.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolve, mockCall } = vi.hoisted(() => ({ mockResolve: vi.fn(), mockCall: vi.fn() }));
vi.mock("@/lib/ai/tenantAi", () => ({ resolveTenantAiSettings: mockResolve, callClaudeForTenant: mockCall }));

import { parseRuleFromNaturalLanguage } from "@/lib/crm/ai/nlToRule";

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ tier: "starter", aiSettings: {} });
});

function llmReturns(obj: any) {
  mockCall.mockResolvedValue({ gated: false, text: JSON.stringify(obj) });
}

describe("parseRuleFromNaturalLanguage", () => {
  it("returns a valid rule for a well-formed model response", async () => {
    llmReturns({ name: "High-value lead follow-up", trigger: "record_created", entity: "Lead", conditions: [{ field: "budget_range", operator: "greater_than", value: 100000 }], actions: [{ type: "create_task", payload: { title: "Call", priority: "High" } }] });
    const out = await parseRuleFromNaturalLanguage("t1", "when a big lead comes in, make a task");
    expect(out.ok).toBe(true);
    if ("rule" in out) {
      expect(out.rule.trigger).toBe("record_created");
      expect(out.rule.actions[0].type).toBe("create_task");
      expect(out.rule.enabled).toBe(false); // created disabled for review
      expect(out.warnings).toEqual([]);
    }
  });

  it("coerces an unknown trigger/entity to safe defaults with warnings", async () => {
    llmReturns({ name: "x", trigger: "when_moon_is_full", entity: "Dragon", conditions: [], actions: [{ type: "create_task", payload: {} }] });
    const out = await parseRuleFromNaturalLanguage("t1", "do a thing");
    expect(out.ok).toBe(true);
    if ("rule" in out) {
      expect(out.rule.trigger).toBe("record_created");
      expect(out.rule.entity).toBe("Lead");
      expect(out.warnings.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("drops invalid conditions and unsupported actions", async () => {
    llmReturns({ name: "x", trigger: "record_created", entity: "Lead", conditions: [{ field: "budget", operator: "telepathy", value: 1 }, { field: "status", operator: "equals", value: "New" }], actions: [{ type: "launch_missiles", payload: {} }, { type: "send_email", payload: { subject: "hi" } }] });
    const out = await parseRuleFromNaturalLanguage("t1", "do a thing");
    expect(out.ok).toBe(true);
    if ("rule" in out) {
      expect(out.rule.conditions).toHaveLength(1);
      expect(out.rule.conditions[0].operator).toBe("equals");
      expect(out.rule.actions).toHaveLength(1);
      expect(out.rule.actions[0].type).toBe("send_email");
    }
  });

  it("fails when no supported action survives validation", async () => {
    llmReturns({ name: "x", trigger: "record_created", entity: "Lead", conditions: [], actions: [{ type: "launch_missiles", payload: {} }] });
    const out = await parseRuleFromNaturalLanguage("t1", "do a thing");
    expect(out.ok).toBe(false);
  });

  it("returns a gated outcome when AI is disabled/over cap", async () => {
    mockCall.mockResolvedValue({ gated: true, code: "AI_LIMIT_REACHED", error: "cap" });
    const out = await parseRuleFromNaturalLanguage("t1", "some real description here");
    expect(out).toMatchObject({ ok: false, gated: true, code: "AI_LIMIT_REACHED" });
  });

  it("rejects a too-short description without calling the model", async () => {
    const out = await parseRuleFromNaturalLanguage("t1", "hi");
    expect(out.ok).toBe(false);
    expect(mockCall).not.toHaveBeenCalled();
  });
});

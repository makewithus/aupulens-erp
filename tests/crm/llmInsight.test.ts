import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveTenantAiSettings, mockCallClaudeForTenant } = vi.hoisted(() => ({
  mockResolveTenantAiSettings: vi.fn(),
  mockCallClaudeForTenant: vi.fn(),
}));

vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: mockResolveTenantAiSettings,
  callClaudeForTenant: mockCallClaudeForTenant,
}));

import { getLlmCrmInsight } from "@/lib/crm/ai/llmInsight";

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveTenantAiSettings.mockResolvedValue({ tier: "starter", aiSettings: {} });
});

describe("getLlmCrmInsight", () => {
  it("returns a parsed, clamped result on a real model response", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({
        score: 82,
        riskLevel: "Medium",
        confidence: 74,
        summary: "Likely to convert.",
        reasoning: "Has budget_range and a Referral source, both strong signals.",
        suggestedAction: "Schedule a discovery call this week.",
      }),
    });

    const result = await getLlmCrmInsight("tenant-a", "Score this lead.", JSON.stringify({ source: "Referral" }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(82);
      expect(result.riskLevel).toBe("Medium");
      expect(result.confidence).toBe(74);
      expect(result.suggestedAction).toBe("Schedule a discovery call this week.");
    }
  });

  it("clamps out-of-range score/confidence into 0-100", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({ score: 140, confidence: -5, summary: "x", reasoning: "y" }),
    });
    const result = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(100);
      expect(result.confidence).toBe(0);
    }
  });

  it("drops an invalid riskLevel rather than passing through garbage", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({ riskLevel: "Extremely Bad", confidence: 50, summary: "x", reasoning: "y" }),
    });
    const result = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.riskLevel).toBeUndefined();
    }
  });

  it("passes draftMessage through when present, leaves it undefined when absent", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({ confidence: 60, summary: "x", reasoning: "y", draftMessage: "Hi there, following up..." }),
    });
    const result = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draftMessage).toBe("Hi there, following up...");

    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({ confidence: 60, summary: "x", reasoning: "y" }),
    });
    const result2 = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result2.ok).toBe(true);
    if (result2.ok) expect(result2.draftMessage).toBeUndefined();
  });

  it("does NOT fabricate a confidence value when the model omits one (the exact bug this replaces)", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: false,
      text: JSON.stringify({ score: 50, summary: "x", reasoning: "y" }),
    });
    const result = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Explicitly 0, never a random/fabricated number.
      expect(result.confidence).toBe(0);
    }
  });

  it("returns a gated outcome (not a thrown error) when the tenant AI kill-switch is on", async () => {
    mockCallClaudeForTenant.mockResolvedValue({
      gated: true,
      code: "AI_DISABLED",
      error: "AI features are disabled for this workspace.",
    });
    const result = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result.ok).toBe(false);
    // strictNullChecks is off project-wide (see lib/ai/claude.ts migration
    // notes), which breaks discriminated-union narrowing on `result.ok` —
    // narrowing on `"gated" in result` instead works either way.
    if ("gated" in result) {
      expect(result.gated).toBe(true);
      expect(result.code).toBe("AI_DISABLED");
    }
  });

  it("returns a non-gated failure when the model reply has no parseable JSON", async () => {
    mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "I cannot help with that." });
    const result = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result.ok).toBe(false);
    if ("gated" in result) {
      expect(result.gated).toBe(false);
    }
  });

  it("returns a non-gated failure (not a throw) when the underlying call rejects", async () => {
    mockCallClaudeForTenant.mockRejectedValue(new Error("network error"));
    const result = await getLlmCrmInsight("tenant-a", "task", "{}");
    expect(result.ok).toBe(false);
    if ("gated" in result) {
      expect(result.gated).toBe(false);
      expect(result.error).toContain("network error");
    }
  });

  it("resolves tenant AI settings with the given tenantId", async () => {
    mockCallClaudeForTenant.mockResolvedValue({ gated: false, text: "{}" });
    await getLlmCrmInsight("tenant-xyz", "task", "{}");
    expect(mockResolveTenantAiSettings).toHaveBeenCalledWith("tenant-xyz");
  });
});

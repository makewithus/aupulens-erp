/**
 * Phase 2 Step 7 — Per-tenant AI preferences + monthly call-cap tests.
 *
 * All tests target lib/ai/tenantAi.ts (callClaudeForTenant, resolveTenantAiSettings)
 * and lib/ai/usage.ts (getAiPeriod, getAiUsageCount, incrementAiUsage).
 * No real Anthropic API calls and no real MongoDB connections are made.
 *
 * Design decisions documented here:
 *   - Usage count reset boundary: UTC calendar month ("YYYYMM")
 *   - Increment policy: only on successful AI response (never on gate or error)
 *   - Cap source: getTierLimits(org.tier).aiCallsPerMonth — never hard-coded
 *   - Tenant preference priority: aiSettings.model > opts.model > CLAUDE_DEFAULT_MODEL
 *     (same for maxTokensPerCall vs opts.maxTokens)
 *   - lib/ai/claude.ts is mocked here (Azure OpenAI-backed as of Phase 0 migration —
 *     see that file's naming note); this suite only exercises tenantAi.ts's own
 *     gating/preference logic, not the underlying provider call.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockConnectDB,
  mockCallClaude,
  mockCallClaudeWithHistory,
  mockOrgFindOne,
  mockAiUsageFindOne,
  mockAiUsageFindOneAndUpdate,
} = vi.hoisted(() => ({
  mockConnectDB:                vi.fn(),
  mockCallClaude:               vi.fn(),
  mockCallClaudeWithHistory:    vi.fn(),
  mockOrgFindOne:               vi.fn(),
  mockAiUsageFindOne:           vi.fn(),
  mockAiUsageFindOneAndUpdate:  vi.fn(),
}));

vi.mock("@/lib/db", () => ({ default: mockConnectDB }));

vi.mock("@/lib/ai/claude", () => ({
  CLAUDE_DEFAULT_MODEL:      "gpt-4o-default-deployment",
  CLAUDE_DEFAULT_MAX_TOKENS: 1024,
  callClaude:                mockCallClaude,
  callClaudeWithHistory:     mockCallClaudeWithHistory,
}));

vi.mock("@/models/admin/Organization", () => {
  function Organization() {}
  Organization.findOne = (...args: any[]) => ({ lean: () => mockOrgFindOne(...args) });
  return { default: Organization };
});

vi.mock("@/models/admin/AiUsage", () => {
  function AiUsage() {}
  AiUsage.findOne          = (...args: any[]) => ({ lean: () => mockAiUsageFindOne(...args) });
  AiUsage.findOneAndUpdate = (...args: any[]) => mockAiUsageFindOneAndUpdate(...args);
  return { default: AiUsage };
});

// ── SUT ───────────────────────────────────────────────────────────────────────
import { callClaudeForTenant, resolveTenantAiSettings } from "@/lib/ai/tenantAi";
import { getAiPeriod } from "@/lib/ai/usage";

// ── Constants ─────────────────────────────────────────────────────────────────
const TENANT_A = "acme";
const TENANT_B = "globex";

// ── Per-test reset ────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockCallClaude.mockResolvedValue("Claude says hello");
  mockCallClaudeWithHistory.mockResolvedValue("Claude says hello (history)");
  mockAiUsageFindOne.mockResolvedValue(null);          // 0 calls by default
  mockAiUsageFindOneAndUpdate.mockResolvedValue({});   // upsert succeeds
});

// ── getAiPeriod ───────────────────────────────────────────────────────────────

describe("getAiPeriod", () => {
  it("returns YYYYMM for UTC calendar month", () => {
    expect(getAiPeriod(new Date("2026-06-15T12:00:00Z"))).toBe("202606");
  });

  it("returns the previous month's period for a date just before UTC month boundary", () => {
    expect(getAiPeriod(new Date("2026-06-30T23:59:59Z"))).toBe("202606");
  });

  it("rolls over to the new month at the UTC month boundary", () => {
    expect(getAiPeriod(new Date("2026-07-01T00:00:00Z"))).toBe("202607");
  });

  it("pads single-digit months with a leading zero", () => {
    expect(getAiPeriod(new Date("2026-01-01T00:00:00Z"))).toBe("202601");
  });

  it("uses current date when called with no argument", () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    expect(getAiPeriod()).toBe(`${y}${m}`);
  });
});

// ── resolveTenantAiSettings ───────────────────────────────────────────────────

describe("resolveTenantAiSettings", () => {
  it("returns tier and aiSettings from the org doc (valid Azure deployment override passes through)", async () => {
    mockOrgFindOne.mockResolvedValue({
      tier: "professional",
      settings: { ai: { model: "gpt-4o-custom", maxTokensPerCall: 2048, disabled: false } },
    });
    const { tier, aiSettings } = await resolveTenantAiSettings(TENANT_A);
    expect(tier).toBe("professional");
    expect(aiSettings.model).toBe("gpt-4o-custom");
    expect(aiSettings.maxTokensPerCall).toBe(2048);
  });

  it("strips a stale Anthropic (claude-*) model override so it falls back to the Azure deployment", async () => {
    // Orgs created before the Azure migration have "claude-sonnet-4-6"
    // persisted — passing that as an Azure deployment name 400s every call.
    mockOrgFindOne.mockResolvedValue({
      tier: "professional",
      settings: { ai: { model: "claude-sonnet-4-6", maxTokensPerCall: 2048, disabled: false } },
    });
    const { aiSettings } = await resolveTenantAiSettings(TENANT_A);
    expect(aiSettings.model).toBeUndefined(); // stripped -> falls back to CLAUDE_DEFAULT_MODEL
    expect(aiSettings.maxTokensPerCall).toBe(2048); // other settings preserved
    expect(aiSettings.disabled).toBe(false);
  });

  it("falls back to 'starter' tier when org.tier is absent", async () => {
    mockOrgFindOne.mockResolvedValue({});
    const { tier } = await resolveTenantAiSettings(TENANT_A);
    expect(tier).toBe("starter");
  });

  it("returns empty aiSettings when org.settings.ai is absent", async () => {
    mockOrgFindOne.mockResolvedValue({ tier: "starter" });
    const { aiSettings } = await resolveTenantAiSettings(TENANT_A);
    expect(aiSettings).toEqual({});
  });

  it("falls back gracefully when org doc does not exist", async () => {
    mockOrgFindOne.mockResolvedValue(null);
    const { tier, aiSettings } = await resolveTenantAiSettings(TENANT_A);
    expect(tier).toBe("starter");
    expect(aiSettings).toEqual({});
  });

  it("queries org by subdomain = tenantId", async () => {
    mockOrgFindOne.mockResolvedValue(null);
    await resolveTenantAiSettings(TENANT_A);
    expect(mockOrgFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ subdomain: TENANT_A }),
      expect.anything()
    );
  });
});

// ── AI disabled ───────────────────────────────────────────────────────────────

describe("callClaudeForTenant — AI_DISABLED", () => {
  const disabledSettings = { disabled: true };

  it("returns gated AI_DISABLED result (not an exception)", async () => {
    const result = await callClaudeForTenant(TENANT_A, "starter", disabledSettings, "hello");
    expect(result).toMatchObject({ gated: true, code: "AI_DISABLED" });
  });

  it("does NOT call the Anthropic API when disabled", async () => {
    await callClaudeForTenant(TENANT_A, "starter", disabledSettings, "hello");
    expect(mockCallClaude).not.toHaveBeenCalled();
    expect(mockCallClaudeWithHistory).not.toHaveBeenCalled();
  });

  it("does NOT increment usage when disabled", async () => {
    await callClaudeForTenant(TENANT_A, "starter", disabledSettings, "hello");
    expect(mockAiUsageFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does NOT read usage DB when disabled (short-circuits before cap check)", async () => {
    await callClaudeForTenant(TENANT_A, "starter", disabledSettings, "hello");
    expect(mockAiUsageFindOne).not.toHaveBeenCalled();
  });
});

// ── Monthly cap enforcement ───────────────────────────────────────────────────

describe("callClaudeForTenant — AI_LIMIT_REACHED", () => {
  it("returns gated AI_LIMIT_REACHED when usage equals the cap (starter = 100)", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 100 }); // at cap
    const result = await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(result).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED", currentTier: "starter", requiredAction: "upgrade" });
  });

  it("returns gated when usage exceeds the cap", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 150 }); // over cap
    const result = await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(result.gated).toBe(true);
  });

  it("does NOT call the Anthropic API when at cap", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 100 });
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it("does NOT increment usage when gated at cap", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 100 });
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(mockAiUsageFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("professional tier allows up to 1000 calls (not gated at 999)", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 999 }); // one call remaining
    const result = await callClaudeForTenant(TENANT_A, "professional", {}, "hello");
    expect(result.gated).toBe(false);
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
  });

  it("professional tier gates at 1000 calls", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 1000 });
    const result = await callClaudeForTenant(TENANT_A, "professional", {}, "hello");
    expect(result).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED", currentTier: "professional" });
  });

  it("enterprise tier gates at 10 000 calls", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 10000 });
    const result = await callClaudeForTenant(TENANT_A, "enterprise", {}, "hello");
    expect(result).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED", currentTier: "enterprise" });
  });

  it("enterprise tier allows 9999 calls (not gated)", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 9999 });
    const result = await callClaudeForTenant(TENANT_A, "enterprise", {}, "hello");
    expect(result.gated).toBe(false);
  });
});

// ── Under-cap happy path ──────────────────────────────────────────────────────

describe("callClaudeForTenant — under cap", () => {
  it("returns gated:false with the Claude response text", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 5 });
    const result = await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(result).toEqual({ gated: false, text: "Claude says hello" });
  });

  it("increments both the tenant and the platform counter by 1 on success", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 5 });
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    // One increment for the tenant, one for the "__platform__" global ceiling.
    expect(mockAiUsageFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockAiUsageFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      { $inc: { count: 1 } },
      { upsert: true }
    );
    expect(mockAiUsageFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "__platform__" }),
      { $inc: { count: 1 } },
      { upsert: true }
    );
  });

  it("works when no usage document exists yet (first call of month — count returns 0)", async () => {
    mockAiUsageFindOne.mockResolvedValue(null); // no document
    const result = await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(result.gated).toBe(false);
    expect(mockAiUsageFindOneAndUpdate).toHaveBeenCalledTimes(2); // tenant + platform
  });
});

// ── Failed Claude call — no increment ────────────────────────────────────────

describe("callClaudeForTenant — failed API call", () => {
  it("does NOT increment usage when callClaude throws", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 5 });
    mockCallClaude.mockRejectedValue(new Error("API error"));

    await expect(
      callClaudeForTenant(TENANT_A, "starter", {}, "hello")
    ).rejects.toThrow("API error");

    expect(mockAiUsageFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("propagates the original error so the route's fallback can handle it", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 0 });
    mockCallClaude.mockRejectedValue(new Error("Network timeout"));

    await expect(
      callClaudeForTenant(TENANT_A, "starter", {}, "hello")
    ).rejects.toThrow("Network timeout");
  });
});

// ── Tenant AI settings applied to the call ───────────────────────────────────

describe("callClaudeForTenant — model + maxTokensPerCall preferences", () => {
  beforeEach(() => {
    mockAiUsageFindOne.mockResolvedValue({ count: 0 });
  });

  it("passes tenant's model preference to callClaude", async () => {
    await callClaudeForTenant(TENANT_A, "starter", { model: "claude-opus-4-8" }, "hello");
    expect(mockCallClaude).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ model: "claude-opus-4-8" })
    );
  });

  it("passes tenant's maxTokensPerCall to callClaude", async () => {
    await callClaudeForTenant(TENANT_A, "starter", { maxTokensPerCall: 2048 }, "hello");
    expect(mockCallClaude).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ maxTokens: 2048 })
    );
  });

  it("tenant model overrides caller opts.model", async () => {
    await callClaudeForTenant(
      TENANT_A, "starter", { model: "claude-opus-4-8" }, "hello",
      { model: "claude-haiku-4-5-20251001" }
    );
    expect(mockCallClaude).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ model: "claude-opus-4-8" }) // tenant wins
    );
  });

  it("tenant maxTokensPerCall overrides caller opts.maxTokens", async () => {
    await callClaudeForTenant(
      TENANT_A, "starter", { maxTokensPerCall: 512 }, "hello",
      { maxTokens: 2048 }
    );
    expect(mockCallClaude).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ maxTokens: 512 }) // tenant wins
    );
  });

  it("falls back to caller opts.model when tenant has no model preference", async () => {
    await callClaudeForTenant(
      TENANT_A, "starter", {}, "hello",
      { model: "claude-haiku-4-5-20251001" }
    );
    expect(mockCallClaude).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" })
    );
  });

  it("falls back to CLAUDE_DEFAULT_MODEL when neither tenant nor caller specifies model", async () => {
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(mockCallClaude).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ model: "gpt-4o-default-deployment" })
    );
  });

  it("passes caller systemPrompt unchanged (tenant does not override system prompt)", async () => {
    await callClaudeForTenant(
      TENANT_A, "starter", { model: "claude-opus-4-8" }, "hello",
      { systemPrompt: "Be precise." }
    );
    expect(mockCallClaude).toHaveBeenCalledWith(
      "hello",
      expect.objectContaining({ systemPrompt: "Be precise." })
    );
  });

  it("uses callClaudeWithHistory when history is provided", async () => {
    const history = [{ role: "user" as const, content: "Hi" }, { role: "assistant" as const, content: "Hello" }];
    await callClaudeForTenant(TENANT_A, "starter", {}, "follow-up", { history });
    expect(mockCallClaudeWithHistory).toHaveBeenCalledWith(
      history,
      "follow-up",
      expect.any(Object)
    );
    expect(mockCallClaude).not.toHaveBeenCalled();
  });

  it("uses callClaude (not callClaudeWithHistory) when history is empty", async () => {
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello", { history: [] });
    expect(mockCallClaude).toHaveBeenCalledTimes(1);
    expect(mockCallClaudeWithHistory).not.toHaveBeenCalled();
  });
});

// ── Period rollover ───────────────────────────────────────────────────────────

describe("callClaudeForTenant — period rollover", () => {
  it("checks usage for the current UTC month period only", async () => {
    const nowPeriod = getAiPeriod();
    mockAiUsageFindOne.mockResolvedValue(null); // fresh month
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(mockAiUsageFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, period: nowPeriod }),
      expect.anything()
    );
  });

  it("increments usage under the current period key", async () => {
    const nowPeriod = getAiPeriod();
    mockAiUsageFindOne.mockResolvedValue(null);
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(mockAiUsageFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A, period: nowPeriod }),
      { $inc: { count: 1 } },
      { upsert: true }
    );
  });

  it("effectively resets quota when a new month starts (previous month's count ignored)", async () => {
    // Simulate: 100 calls in previous period (would be at starter cap).
    // Current period has 0 calls. The current month period has fresh count.
    mockAiUsageFindOne.mockImplementation(({ period }: { period: string }) => {
      const nowPeriod = getAiPeriod();
      if (period === nowPeriod) return Promise.resolve(null); // new month, 0 calls
      return Promise.resolve({ count: 100 }); // old month (would be over cap, but not queried)
    });
    const result = await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(result.gated).toBe(false); // not gated because current month has 0 calls
  });
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

describe("callClaudeForTenant — tenant isolation", () => {
  it("org A's usage does not affect org B's quota", async () => {
    mockAiUsageFindOne.mockImplementation(({ tenantId }: { tenantId: string }) => {
      if (tenantId === TENANT_A) return Promise.resolve({ count: 100 }); // A is at cap
      if (tenantId === TENANT_B) return Promise.resolve({ count: 0 });  // B has calls remaining
      return Promise.resolve(null);
    });

    const resultA = await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(resultA.gated).toBe(true);  // A is gated

    vi.resetAllMocks();
    mockConnectDB.mockResolvedValue(undefined);
    mockCallClaude.mockResolvedValue("response");
    mockAiUsageFindOneAndUpdate.mockResolvedValue({});
    mockAiUsageFindOne.mockResolvedValue({ count: 0 });

    const resultB = await callClaudeForTenant(TENANT_B, "starter", {}, "hello");
    expect(resultB.gated).toBe(false); // B is not affected
  });

  it("increments usage for the calling tenant only (plus the platform counter, never another tenant)", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 5 });
    await callClaudeForTenant(TENANT_A, "starter", {}, "hello");
    expect(mockAiUsageFindOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
      expect.anything(),
      expect.anything()
    );
    // The only tenantIds touched are TENANT_A and the platform sentinel —
    // never TENANT_B.
    const touched = mockAiUsageFindOneAndUpdate.mock.calls.map((c: any[]) => c[0]?.tenantId);
    expect(touched).toEqual(expect.arrayContaining([TENANT_A, "__platform__"]));
    expect(touched).not.toContain(TENANT_B);
    expect(mockAiUsageFindOneAndUpdate).toHaveBeenCalledTimes(2);
  });
});

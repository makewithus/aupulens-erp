/**
 * AI safety-guard tests (two-model completion pass).
 *
 * With no cheap-tier model as a cost safety valve, the per-tenant monthly
 * call cap is the main thing between a runaway loop and a blown trial budget,
 * and per-tenant ChatHistory isolation is a real cross-tenant data-leak risk
 * if wrong. These two guards get explicit, focused coverage here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Part 1: a deliberately tight cap (3/month) blocks the 4th call, and this
// is feature-agnostic (every AI route goes through callClaudeForTenant). ──────

const { mockConnectDB, mockCallClaude, mockOrgFindOne, mockAiUsageFindOne, mockGlobalFindOne, mockAiUsageUpsert, mockGetTierLimits } =
  vi.hoisted(() => ({
    mockConnectDB: vi.fn(),
    mockCallClaude: vi.fn(),
    mockOrgFindOne: vi.fn(),
    mockAiUsageFindOne: vi.fn(),
    mockGlobalFindOne: vi.fn(),
    mockAiUsageUpsert: vi.fn(),
    mockGetTierLimits: vi.fn(),
  }));

vi.mock("@/lib/db", () => ({ default: mockConnectDB }));
vi.mock("@/lib/ai/claude", () => ({
  CLAUDE_DEFAULT_MODEL: "gpt-4o",
  CLAUDE_DEFAULT_MAX_TOKENS: 1024,
  callClaude: mockCallClaude,
  callClaudeWithHistory: vi.fn(),
}));
vi.mock("@/models/Organization", () => {
  function Organization() {}
  (Organization as any).findOne = (...a: any[]) => ({ lean: () => mockOrgFindOne(...a) });
  return { default: Organization };
});
vi.mock("@/models/AiUsage", () => {
  function AiUsage() {}
  // Route the platform-wide ceiling read (tenantId "__platform__") separately
  // from the per-tenant read, so per-tenant test values aren't consumed by the
  // global-ceiling check that now runs first on every call.
  (AiUsage as any).findOne = (query: any, ...a: any[]) => ({
    lean: () =>
      query?.tenantId === "__platform__"
        ? mockGlobalFindOne(query, ...a)
        : mockAiUsageFindOne(query, ...a),
  });
  (AiUsage as any).findOneAndUpdate = (...a: any[]) => mockAiUsageUpsert(...a);
  return { default: AiUsage };
});
vi.mock("@/lib/constants/tiers", () => ({ getTierLimits: mockGetTierLimits }));

import { callClaudeForTenant } from "@/lib/ai/tenantAi";

beforeEach(() => {
  vi.clearAllMocks();
  mockConnectDB.mockResolvedValue(undefined);
  mockCallClaude.mockResolvedValue("ok");
  mockAiUsageUpsert.mockResolvedValue({});
  // Global ceiling well below its default (17000) unless a test overrides it.
  mockGlobalFindOne.mockResolvedValue({ count: 0 });
  mockGetTierLimits.mockReturnValue({ aiCallsPerMonth: 3, maxUsers: 5, enabledModules: [] });
});

describe("tight monthly cap (3) blocks the 4th call — feature-agnostic", () => {
  it("allows calls 1-3 (under cap) then blocks the 4th with AI_LIMIT_REACHED", async () => {
    // Simulate the usage counter climbing 0 -> 1 -> 2 -> 3.
    for (const count of [0, 1, 2]) {
      mockAiUsageFindOne.mockResolvedValueOnce({ count });
      const res = await callClaudeForTenant("acme", "starter", {}, "score this lead");
      expect("text" in res).toBe(true); // not gated
    }
    // 4th call: counter is now at the cap of 3.
    mockAiUsageFindOne.mockResolvedValueOnce({ count: 3 });
    const blocked = await callClaudeForTenant("acme", "starter", {}, "score this lead");
    expect(blocked).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED" });
    // The underlying model is NOT called on the blocked request.
    expect(mockCallClaude).toHaveBeenCalledTimes(3);
  });

  it("blocks a completely different feature's call too, once at cap (Finance-style prompt)", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 3 });
    const res = await callClaudeForTenant("acme", "starter", {}, "explain the P&L trend", { maxTokens: 1024 });
    expect(res).toMatchObject({ gated: true, code: "AI_LIMIT_REACHED" });
  });

  it("does NOT increment usage on a blocked call (no phantom spend)", async () => {
    mockAiUsageFindOne.mockResolvedValue({ count: 3 });
    await callClaudeForTenant("acme", "starter", {}, "hi");
    expect(mockAiUsageUpsert).not.toHaveBeenCalled();
  });
});

// ── Part 2: the global platform ceiling (AI_GLOBAL_MONTHLY_CAP) hard-stops
// every tenant regardless of tier, and is checked BEFORE the per-tier cap. ────

describe("global platform ceiling sits above per-tier caps", () => {
  const OLD_ENV = process.env.AI_GLOBAL_MONTHLY_CAP;
  afterEach(() => { process.env.AI_GLOBAL_MONTHLY_CAP = OLD_ENV; });

  it("blocks an enterprise tenant that is under its OWN tier cap once the global ceiling is hit", async () => {
    process.env.AI_GLOBAL_MONTHLY_CAP = "5";
    // Enterprise tier: 10k/mo — this tenant has plenty of its own quota left...
    mockGetTierLimits.mockReturnValue({ aiCallsPerMonth: 10000, maxUsers: 999, enabledModules: [] });
    mockAiUsageFindOne.mockResolvedValue({ count: 12 }); // tenant well under 10k
    // ...but the platform-wide counter is already at the global ceiling of 5.
    mockGlobalFindOne.mockResolvedValue({ count: 5 });

    const res = await callClaudeForTenant("bigco", "enterprise", {}, "score this lead");
    expect(res).toMatchObject({ gated: true, code: "AI_GLOBAL_LIMIT_REACHED" });
    // Model not called, neither counter incremented.
    expect(mockCallClaude).not.toHaveBeenCalled();
    expect(mockAiUsageUpsert).not.toHaveBeenCalled();
  });

  it("increments BOTH the per-tenant and the platform counter on a successful call", async () => {
    process.env.AI_GLOBAL_MONTHLY_CAP = "17000";
    mockGetTierLimits.mockReturnValue({ aiCallsPerMonth: 10000, maxUsers: 999, enabledModules: [] });
    mockAiUsageFindOne.mockResolvedValue({ count: 1 });
    mockGlobalFindOne.mockResolvedValue({ count: 100 });

    const res = await callClaudeForTenant("bigco", "enterprise", {}, "hi");
    expect("text" in res).toBe(true);
    // One upsert for the tenant counter, one for the "__platform__" counter.
    expect(mockAiUsageUpsert).toHaveBeenCalledTimes(2);
    const upsertedTenants = mockAiUsageUpsert.mock.calls.map((c) => c[0]?.tenantId);
    expect(upsertedTenants).toContain("bigco");
    expect(upsertedTenants).toContain("__platform__");
  });

  it("defaults the ceiling to 17000 when the env var is unset/invalid", async () => {
    delete process.env.AI_GLOBAL_MONTHLY_CAP;
    mockGetTierLimits.mockReturnValue({ aiCallsPerMonth: 10000, maxUsers: 999, enabledModules: [] });
    mockAiUsageFindOne.mockResolvedValue({ count: 1 });
    // Just under the default ceiling → allowed.
    mockGlobalFindOne.mockResolvedValue({ count: 16999 });
    const ok = await callClaudeForTenant("bigco", "enterprise", {}, "hi");
    expect("text" in ok).toBe(true);
    // At the default ceiling → blocked.
    mockGlobalFindOne.mockResolvedValue({ count: 17000 });
    const blocked = await callClaudeForTenant("bigco", "enterprise", {}, "hi");
    expect(blocked).toMatchObject({ gated: true, code: "AI_GLOBAL_LIMIT_REACHED" });
  });
});

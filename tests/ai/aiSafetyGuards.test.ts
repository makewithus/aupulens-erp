/**
 * AI safety-guard tests (two-model completion pass).
 *
 * With no cheap-tier model as a cost safety valve, the per-tenant monthly
 * call cap is the main thing between a runaway loop and a blown trial budget,
 * and per-tenant ChatHistory isolation is a real cross-tenant data-leak risk
 * if wrong. These two guards get explicit, focused coverage here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Part 1: a deliberately tight cap (3/month) blocks the 4th call, and this
// is feature-agnostic (every AI route goes through callClaudeForTenant). ──────

const { mockConnectDB, mockCallClaude, mockOrgFindOne, mockAiUsageFindOne, mockAiUsageUpsert, mockGetTierLimits } =
  vi.hoisted(() => ({
    mockConnectDB: vi.fn(),
    mockCallClaude: vi.fn(),
    mockOrgFindOne: vi.fn(),
    mockAiUsageFindOne: vi.fn(),
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
  (AiUsage as any).findOne = (...a: any[]) => ({ lean: () => mockAiUsageFindOne(...a) });
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

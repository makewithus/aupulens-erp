/**
 * Suggested follow-up message engine — drafts (never sends) a message, and
 * degrades gracefully when AI is gated or errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolve, mockCall } = vi.hoisted(() => ({ mockResolve: vi.fn(), mockCall: vi.fn() }));
vi.mock("@/lib/ai/tenantAi", () => ({
  resolveTenantAiSettings: mockResolve,
  callClaudeForTenant: mockCall,
}));

import { draftFollowUpMessage } from "@/lib/crm/ai/followUpMessage";

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue({ tier: "starter", aiSettings: {} });
});

describe("draftFollowUpMessage", () => {
  it("returns the drafted message on success", async () => {
    mockCall.mockResolvedValue({ text: "  Hi Arjun, following up on our proposal — happy to walk you through it this week.  " });
    const r = await draftFollowUpMessage({ tenantId: "t1", entityType: "Lead", context: { name: "Arjun" } });
    expect(r.ok).toBe(true);
    expect(r.message).toBe("Hi Arjun, following up on our proposal — happy to walk you through it this week.");
  });

  it("flags gated when AI is disabled/over cap (no throw)", async () => {
    mockCall.mockResolvedValue({ gated: true, code: "AI_DISABLED", error: "off" });
    const r = await draftFollowUpMessage({ tenantId: "t1", entityType: "Opportunity", context: {} });
    expect(r.ok).toBe(false);
    expect(r.gated).toBe(true);
  });

  it("degrades gracefully when the AI call throws", async () => {
    mockCall.mockRejectedValue(new Error("boom"));
    const r = await draftFollowUpMessage({ tenantId: "t1", entityType: "Account", context: {} });
    expect(r.ok).toBe(false);
    expect(r.message).toBe("");
  });

  it("adjusts brevity by channel (still returns text)", async () => {
    mockCall.mockResolvedValue({ text: "Quick nudge on the renewal — shall we lock it in?" });
    const r = await draftFollowUpMessage({ tenantId: "t1", entityType: "Account", context: { name: "Acme" }, channel: "whatsapp" });
    expect(r.ok).toBe(true);
    expect(r.message.length).toBeGreaterThan(0);
  });
});

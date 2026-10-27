import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), find: vi.fn(), count: vi.fn(), windows: vi.fn(), credits: vi.fn() }));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ default: m.db }));
vi.mock("@/models/admin/Organization", () => ({ default: { findOne: (...args: unknown[]) => ({ lean: () => m.find(...args) }) } }));
vi.mock("@/lib/ai/usage", () => ({ getAiPeriod: () => "202610", getAiUsageCount: m.count }));
vi.mock("@/lib/ai/windowUsage", () => ({ getWindowUsage: m.windows }));
vi.mock("@/lib/platform/ai/credits", () => ({ getAiCreditBalance: m.credits }));
import { GET } from "@/app/api/ai/usage/route";
import { emptyUsage } from "@/lib/ai/usagePolicy";
beforeEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
  m.auth.mockResolvedValue({ user: { id: "user-a", tenantId: "org-a", role: "hr" } });
  m.find.mockResolvedValue({ tier: "professional", isActive: true, settings: {} });
  m.count.mockResolvedValue(20);
  m.windows.mockResolvedValue({ session: emptyUsage("unconfigured"), weekly: emptyUsage("unconfigured") });
  m.credits.mockResolvedValue({ planKey: "pro", limit: 100, used: 2, reserved: 0, remaining: 98 });
});
describe("authenticated toolbar usage", () => {
  it("returns only the authenticated workspace's summary, including its enforced tier limit", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-15T12:00Z"));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ scope: "workspace", monthly: { used: 20, limit: 1000, percentage: 2, windowStartedAt: "2026-10-01T00:00:00.000Z", resetsAt: "2026-11-01T00:00:00.000Z" }, serverTime: "2026-10-15T12:00:00.000Z" });
    expect(m.find).toHaveBeenCalledWith(
      { $or: [{ subdomain: "org-a" }, { slug: "org-a" }] },
      {
        tier: 1,
        isActive: 1,
        subscriptionStatus: 1,
        trialEndDate: 1,
        "settings.ai.usagePolicy": 1,
      },
    );
    expect(m.count).toHaveBeenCalledWith("org-a", "202610");
    expect(Object.keys(body.data).sort()).toEqual(["credits", "monthly", "scope", "serverTime", "session", "weekly"]);
    expect(body.data.credits).toMatchObject({ planKey: "pro", limit: 100, used: 2, reserved: 0, remaining: 98, resetsAt: "2026-11-01T00:00:00.000Z" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    vi.useRealTimers();
  });
  it("rejects missing identity or tenant before any database access", async () => {
    for (const session of [null, { user: { id: "a" } }, { user: { tenantId: "b" } }]) {
      m.auth.mockResolvedValue(session);
      expect((await GET()).status).toBe(401);
    }
    expect(m.find).not.toHaveBeenCalled();
  });
  it("cannot accept a client tenant override (GET has no input) and isolates sequential users", async () => {
    await GET();
    m.auth.mockResolvedValue({ user: { id: "user-b", tenantId: "org-b" } });
    await GET();
    expect(m.count.mock.calls.map(c => c[0])).toEqual(["org-a", "org-b"]);
  });
  it("denies deleted/inactive tenants and expired subscriptions", async () => {
    for (const org of [null, { isActive: false }, { subscriptionStatus: "cancelled" }, { subscriptionStatus: "trial", trialEndDate: new Date("2020-01-01") }]) {
      m.find.mockResolvedValue(org);
      expect([402, 403]).toContain((await GET()).status);
    }
    expect(m.count).not.toHaveBeenCalled();
  });
  it("uses the established starter tier fallback when no subscription tier is set", async () => {
    m.find.mockResolvedValue({ settings: {} });
    expect((await (await GET()).json()).data.monthly.limit).toBe(100);
  });
  it("does not leak database errors or return false zeros", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.count.mockRejectedValue(new Error("internal-db-details"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ success: false, message: "Usage unavailable" });
    expect(log).toHaveBeenCalled(); log.mockRestore();
  });
});

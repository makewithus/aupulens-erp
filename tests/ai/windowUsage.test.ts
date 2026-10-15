import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), increment: vi.fn() }));
vi.mock("@/lib/ai/usage", () => ({ getAiUsageCount: mocks.read, incrementAiUsage: mocks.increment }));
import { getWindowUsage, incrementWindowUsage } from "@/lib/ai/windowUsage";
import { quotaWindow, type AiWindowPolicy } from "@/lib/ai/usagePolicy";
const policy: AiWindowPolicy = { startsAt: "2026-10-15T00:00Z", session: { minutes: 60, limit: 10 }, weekly: { limit: 40 } };
const now = new Date("2026-10-15T00:30Z");
beforeEach(() => vi.resetAllMocks());
describe("persisted window accounting", () => {
  it("reuses tenant-scoped atomic counters and queries only the current windows", async () => {
    mocks.read.mockResolvedValue(2);
    expect(await getWindowUsage("org-a", policy, now)).toMatchObject({ session: { used: 2, percentage: 20 }, weekly: { used: 2, percentage: 5 } });
    await incrementWindowUsage("org-a", policy, now);
    for (const kind of ["session", "weekly"] as const) {
      const window = quotaWindow(policy, kind, now);
      expect(mocks.read).toHaveBeenCalledWith("org-a", typeof window !== "string" && window.period);
      expect(mocks.increment).toHaveBeenCalledWith("org-a", typeof window !== "string" && window.period);
    }
  });
  it("does not read or write for unconfigured windows", async () => {
    expect(await getWindowUsage("org-a", undefined, now)).toMatchObject({ session: { status: "unconfigured", used: null }, weekly: { status: "unconfigured", used: null } });
    await incrementWindowUsage("org-a", undefined, now);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.increment).not.toHaveBeenCalled();
  });
  it("retains the admission window for delayed requests and isolates tenants", async () => {
    await incrementWindowUsage("org-a", policy, now);
    await incrementWindowUsage("org-b", policy, new Date("2026-10-15T02:30Z"));
    expect(mocks.increment.mock.calls[0][0]).toBe("org-a");
    expect(mocks.increment.mock.calls[2][0]).toBe("org-b");
    expect(mocks.increment.mock.calls[0][1]).not.toBe(mocks.increment.mock.calls[2][1]);
  });
  it("propagates database failures rather than fabricating zero", async () => {
    mocks.read.mockRejectedValue(new Error("offline"));
    await expect(getWindowUsage("org-a", policy, now)).rejects.toThrow("offline");
  });
});

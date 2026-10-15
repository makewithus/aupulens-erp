import { describe, it, expect } from "vitest";
import { quotaWindow, usageMetric, type AiWindowPolicy } from "@/lib/ai/usagePolicy";
import { formatResetCountdown, usageLabel } from "@/lib/ai/usageDisplay";
const policy: AiWindowPolicy = { startsAt: "2026-10-14T10:00:00Z", session: { minutes: 90, limit: 20 }, weekly: { limit: 100 } };

describe("explicit AI quota policy", () => {
  it("does not invent session or weekly quotas", () => {
    expect(quotaWindow(undefined, "session", new Date())).toBe("unconfigured");
    expect(quotaWindow(undefined, "weekly", new Date())).toBe("unconfigured");
  });
  it("uses anchored UTC session windows and rolls at the exact boundary", () => {
    const before = quotaWindow(policy, "session", new Date("2026-10-14T16:59:59+05:30"));
    const after = quotaWindow(policy, "session", new Date("2026-10-14T17:00:00+05:30"));
    expect(before).toMatchObject({ start: new Date("2026-10-14T10:00Z"), end: new Date("2026-10-14T11:30Z") });
    expect(after).toMatchObject({ start: new Date("2026-10-14T11:30Z"), end: new Date("2026-10-14T13:00Z") });
  });
  it("starts the first weekly window at activation, then rolls Monday UTC", () => {
    expect(quotaWindow(policy, "weekly", new Date("2026-10-15T00:00Z"))).toMatchObject({
      start: new Date(policy.startsAt), end: new Date("2026-10-19T00:00Z"),
    });
    expect(quotaWindow(policy, "weekly", new Date("2026-10-19T00:00Z"))).toMatchObject({
      start: new Date("2026-10-19T00:00Z"), end: new Date("2026-10-26T00:00Z"),
    });
  });
  it("rejects invalid config and leaves future policies inactive", () => {
    expect(quotaWindow({ ...policy, startsAt: "bad" }, "session", new Date())).toBe("unavailable");
    expect(quotaWindow(policy, "session", new Date("2026-01-01"))).toBe("unconfigured");
    for (const minutes of [0, -1, NaN, Infinity, 1.2, 525601]) {
      expect(quotaWindow({ ...policy, session: { minutes, limit: 10 } }, "session", new Date("2026-10-15"))).toBe("unavailable");
    }
    expect(quotaWindow({ ...policy, weekly: { limit: -1 } }, "weekly", new Date("2026-10-15"))).toBe("unavailable");
  });
  it("distinguishes zero, exhaustion, reduced quota, unlimited and invalid limits", () => {
    const start = new Date("2026-10-14"), end = new Date("2026-10-15");
    expect(usageMetric(0, 20, start, end)).toMatchObject({ used: 0, percentage: 0, status: "available" });
    expect(usageMetric(20, 20, start, end)).toMatchObject({ percentage: 100, status: "exhausted" });
    expect(usageMetric(30, 20, start, end)).toMatchObject({ percentage: 150, status: "exhausted" });
    expect(usageMetric(0, 0, start, end)).toMatchObject({ percentage: null, status: "exhausted" });
    expect(usageMetric(30, null, start, end)).toMatchObject({ percentage: null, status: "unlimited" });
    expect(usageMetric(0, NaN, start, end).status).toBe("unavailable");
  });
});
describe("usage display", () => {
  const now = Date.parse("2026-10-15T00:00Z");
  it.each([[45, "45m"], [149, "2h 29m"], [2640, "1d 20h"], [0, "Resetting…"], [-5, "Resetting…"]])("formats %s minutes", (minutes, expected) => {
    expect(formatResetCountdown(new Date(now + Number(minutes) * 60000).toISOString(), now)).toBe(expected);
  });
  it("handles missing timestamps, loading and unavailable without false zeros", () => {
    expect(formatResetCountdown(null, now)).toBeNull();
    expect(formatResetCountdown("invalid", now)).toBeNull();
    expect(usageLabel()).toBe("Loading…");
    expect(usageLabel({ ...usageMetric(0, 10, new Date(now), new Date(now)), status: "unavailable", percentage: null })).toBe("Unavailable");
  });
});

describe("policy configuration validation regressions", () => {
  it("rejects missing limits, including future policies, without interpreting them as unlimited", () => {
    for (const startsAt of ["2026-01-01T00:00Z", "2099-01-01T00:00Z"]) {
      const missingLimit = { startsAt, session: { minutes: 60 } } as AiWindowPolicy;
      expect(quotaWindow(missingLimit, "session", new Date("2026-10-15T00:00Z"))).toBe("unavailable");
      expect(quotaWindow(missingLimit, "weekly", new Date("2026-10-15T00:00Z"))).toBe("unavailable");
    }
  });
  it("rejects invalid dates and overflow instead of throwing", () => {
    expect(quotaWindow(policy, "session", new Date(NaN))).toBe("unavailable");
    const extreme = { startsAt: "+275760-09-13T00:00:00Z", session: { minutes: 60, limit: 1 } };
    expect(quotaWindow(extreme, "session", new Date(8640000000000000))).toBe("unavailable");
  });
});

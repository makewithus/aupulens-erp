import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ hook: vi.fn() }));
vi.mock("@/lib/hooks/useAiUsageSummary", () => ({ useAiUsageSummary: m.hook }));
import { AiUsageIndicator, UsageItem } from "@/components/ai/AiUsageIndicator";
import { emptyUsage, usageMetric } from "@/lib/ai/usagePolicy";
const start = new Date("2026-10-15T00:00Z"), end = new Date("2026-10-15T02:29Z");
describe("compact usage footer markup", () => {
  it("renders loading and unavailable states without fake percentages", () => {
    for (const unavailable of [false, true]) {
      m.hook.mockReturnValue({ unavailable, now: start.getTime() });
      const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
      expect(html).toContain(`aria-busy="${unavailable ? "false" : "true"}"`);
      expect(html).not.toContain("0%");
      expect(html).not.toContain('role="progressbar"');
    }
  });
  it("renders aligned request quotas and reset text", () => {
    m.hook.mockReturnValue({ data: { session: usageMetric(2, 100, start, end), weekly: usageMetric(7, 100, start, end), monthly: usageMetric(7, 100, start, end) }, now: start.getTime() });
    const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
    expect(html).toContain("Session: 2%"); expect(html).toContain("Weekly: 7%");
    expect(html).toContain("resets in 2h 29m");
    expect(html).toContain("2 successful workspace requests of 100");
    expect(html).toContain("flex-wrap");
  });
  it("retains the exact real percentage when over quota", () => {
    const html = renderToStaticMarkup(React.createElement(UsageItem, { label: "Session", metric: usageMetric(150, 100, start, end), now: start.getTime(), progress: true }));
    expect(html).toContain("150%"); expect(html).toContain("limit reached");
  });
  it("distinguishes unlimited and zero allowance", () => {
    for (const [limit, expected] of [[null, "Unlimited"], [0, "No allowance"]] as const) {
      const html = renderToStaticMarkup(React.createElement(UsageItem, { label: "Session", metric: usageMetric(0, limit, start, end), now: start.getTime(), progress: true }));
      expect(html).toContain(expected);
    }
  });
  it("shows small deductions and explains unconfigured request limits", () => {
    m.hook.mockReturnValue({ data: { session: emptyUsage("unconfigured"), weekly: emptyUsage("unconfigured"), monthly: usageMetric(4, 100, start, end), credits: { used: 0.025, reserved: 0, limit: 20, remaining: 19.975, resetsAt: end.toISOString() } }, now: start.getTime() });
    const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
    expect(html).toContain("Session: No limit set"); expect(html).toContain("Weekly: No limit set");
    expect(html).toContain("Credits: 0.13% used");
    expect(html).toContain("19.975 remaining");
    expect(html).not.toContain("left");
    expect(html).not.toContain("Monthly: 4%");
  });
  it("preserves precise credit usage and low and exhaustion states", () => {
    for (const [used, remaining, expected] of [[1.25, 8.75, "12.5% used"], [10, 0, "100% used · limit reached"]] as const) {
      m.hook.mockReturnValue({ data: { session: emptyUsage("unconfigured"), weekly: emptyUsage("unconfigured"), credits: { used, reserved: 0, limit: 10, remaining, resetsAt: end.toISOString() } }, now: start.getTime() });
      const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
      expect(html).toContain(`Credits: ${expected}`);
      expect(html).not.toContain(" left");
    }
  });
});

it("shows distinct loading, failed and missing-policy states", () => {
  for (const [metric, text] of [[undefined, "Loading…"], [emptyUsage("unavailable"), "Unavailable"], [emptyUsage("unconfigured"), "No limit set"]] as const) {
    const html = renderToStaticMarkup(React.createElement(UsageItem, { label: "Session", metric, now: start.getTime() }));
    expect(html).toContain(`Session: ${text}`);
    expect(html).not.toContain("Session: —");
  }
});
it("shows zero credit use accurately and pending reservations separately", () => {
  m.hook.mockReturnValue({ data: { session: emptyUsage("unconfigured"), weekly: emptyUsage("unconfigured"), credits: { used: 0, reserved: 2, limit: 10, remaining: 8, resetsAt: end.toISOString() } }, now: start.getTime() });
  const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
  expect(html).toContain("Credits: 0% used");
  expect(html).toContain("2 pending");
  expect(html).toContain("resets in 2h 29m");
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ hook: vi.fn() }));
vi.mock("@/lib/hooks/useAiUsageSummary", () => ({ useAiUsageSummary: m.hook }));
import { AiUsageIndicator, UsageItem } from "@/components/ai/AiUsageIndicator";
import { emptyUsage, usageMetric } from "@/lib/ai/usagePolicy";
const start = new Date("2026-10-15T00:00Z"), end = new Date("2026-10-15T02:29Z");
describe("compact toolbar markup", () => {
  it("renders honest loading and unavailable states", () => {
    for (const unavailable of [false, true]) {
      m.hook.mockReturnValue({ unavailable, now: start.getTime() });
      const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
      expect(html).toContain(unavailable ? "Unavailable" : "Loading…");
      expect(html).not.toContain("0%");
      expect(html).not.toContain('role="progressbar"');
    }
  });
  it("renders accessible real percentages, progress and reset text", () => {
    m.hook.mockReturnValue({ data: { session: usageMetric(2, 100, start, end), weekly: usageMetric(7, 100, start, end) }, now: start.getTime() });
    const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
    expect(html).toContain("Session: 2%"); expect(html).toContain("Weekly: 7%");
    expect(html).toContain('aria-valuenow="2"'); expect(html).toContain("resets in 2h 29m");
    expect(html).toContain("2 successful workspace requests of 100");
    expect(html).toContain("flex-wrap");
  });
  it("clamps only the visual bar when over quota and retains the real percentage", () => {
    const html = renderToStaticMarkup(React.createElement(UsageItem, { label: "Session", metric: usageMetric(150, 100, start, end), now: start.getTime(), progress: true }));
    expect(html).toContain("150%"); expect(html).toContain('aria-valuenow="100"'); expect(html).toContain("limit reached");
  });
  it("distinguishes unlimited and zero allowance", () => {
    for (const [limit, expected] of [[null, "Unlimited"], [0, "No allowance"]] as const) {
      const html = renderToStaticMarkup(React.createElement(UsageItem, { label: "Session", metric: usageMetric(0, limit, start, end), now: start.getTime(), progress: true }));
      expect(html).toContain(expected); expect(html).not.toContain('role="progressbar"');
    }
  });
  it("shows the existing monthly quota when new windows have no policy", () => {
    m.hook.mockReturnValue({ data: { session: emptyUsage("unconfigured"), weekly: emptyUsage("unconfigured"), monthly: usageMetric(4, 100, start, end) }, now: start.getTime() });
    const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
    expect(html).toContain("Not configured"); expect(html).toContain("Monthly: 4%");
  });
});

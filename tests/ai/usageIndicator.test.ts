import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

const m = vi.hoisted(() => ({ hook: vi.fn() }));
vi.mock("@/lib/hooks/useAiUsageSummary", () => ({ useAiUsageSummary: m.hook }));
import { AiUsageIndicator, CreditWindowCard } from "@/components/ai/AiUsageIndicator";

const now = Date.parse("2026-10-19T13:42:00.000Z");
const reset = "2026-10-19T15:00:00.000Z";
const session = { used: 2, reserved: 1, limit: 20, remaining: 17, startsAt: "2026-10-19T10:00:00.000Z", resetsAt: reset, unit: "credits" as const };
const weekly = { used: 27, reserved: 0, limit: 100, remaining: 73, startsAt: "2026-10-19T00:00:00.000Z", resetsAt: "2026-10-26T00:00:00.000Z", unit: "credits" as const };

describe("AI usage indicator", () => {
  it("shows current session and weekly usage compactly with countdowns", () => {
    m.hook.mockReturnValue({ data: {
      session: {}, weekly: {}, monthly: {}, serverTime: new Date(now).toISOString(),
      credits: { planKey: "pro", used: 45, reserved: 1, limit: 500, remaining: 454, resetsAt: "2026-11-01T00:00:00.000Z", windows: { session, weekly } },
    }, unavailable: false, now });
    const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
    expect(html).toContain("5h 15%");
    expect(html).toContain("1h 18m");
    expect(html).toContain("Week 27%");
    expect(html).toContain("6d 10h");
    expect(html).toContain("Pro plan");
    expect(html).not.toContain("Monthly plan allowance");
    expect(html).toContain("Show AI session and weekly usage details");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Monthly:");
  });

  it("shows loading/unavailable states without fabricating a percentage", () => {
    for (const unavailable of [false, true]) {
      m.hook.mockReturnValue({ unavailable, now });
      const html = renderToStaticMarkup(React.createElement(AiUsageIndicator));
      expect(html).toContain(`aria-busy="${unavailable ? "false" : "true"}`);
      expect(html).not.toContain("0%");
    }
  });

  it("details distinguish actual use, pending reservations, remaining units and reset", () => {
    const html = renderToStaticMarkup(React.createElement(CreditWindowCard, { label: "Session", cadence: "5 hours", metric: session, now }));
    expect(html).toContain("Session limit");
    expect(html).toContain("20 units");
    expect(html).toContain("2 used + 1 pending");
    expect(html).toContain("17 remaining");
    expect(html).toContain("Resets in 1h 18m");
    expect(html).toContain("15% used");
  });

  it("reflects low and exhausted windows in accessible status colors and text", () => {
    const low = renderToStaticMarkup(React.createElement(CreditWindowCard, {
      label: "Weekly", cadence: "7 days", metric: { ...weekly, used: 85, remaining: 15 }, now,
    }));
    expect(low).toContain("85% used");
    const exhausted = renderToStaticMarkup(React.createElement(CreditWindowCard, {
      label: "Session", cadence: "5 hours", metric: { ...session, used: 20, reserved: 0, remaining: 0 }, now,
    }));
    expect(exhausted).toContain("100% used");
  });
});

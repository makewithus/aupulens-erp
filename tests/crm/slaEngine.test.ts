import { describe, expect, it } from "vitest";
import { computeSlaAnalytics, isSlaCurrentlyBreached, startOfIndiaBusinessDay } from "@/lib/crm/slaEngine";

describe("CRM case SLA consistency", () => {
  const now = new Date("2026-10-30T15:00:00.000Z");

  it("derives current breach state from the due date and active status", () => {
    expect(isSlaCurrentlyBreached({ status: "Open", sla_target_at: "2026-10-30T14:59:59.000Z" }, now)).toBe(true);
    expect(isSlaCurrentlyBreached({ status: "In Progress", sla_target_at: "2026-10-30T15:00:01.000Z" }, now)).toBe(false);
    expect(isSlaCurrentlyBreached({ status: "Resolved", sla_target_at: "2026-10-29T00:00:00.000Z" }, now)).toBe(false);
    expect(isSlaCurrentlyBreached({ status: "Open", sla_target_at: null }, now)).toBe(false);
  });

  it("uses the India business day boundary for daily dashboard metrics", () => {
    expect(startOfIndiaBusinessDay(new Date("2026-10-30T15:00:00.000Z")).toISOString())
      .toBe("2026-10-29T18:30:00.000Z");
  });

  it("does not trust stale stored breach flags for current compliance analytics", () => {
    const result = computeSlaAnalytics([
      { status: "Open", sla_target_at: "2026-10-30T14:00:00.000Z", sla_breached: false },
      { status: "Open", sla_target_at: "2026-10-30T16:00:00.000Z", sla_breached: true },
      { status: "Closed", sla_target_at: "2026-10-29T00:00:00.000Z", sla_breached: true },
    ]);
    expect(result.breachPercentage).toBeCloseTo(100 / 3);
  });

  it("measures resolution from resolvedAt instead of later edits", () => {
    const result = computeSlaAnalytics([{
      status: "Resolved",
      createdAt: "2026-10-30T10:00:00.000Z",
      resolvedAt: "2026-10-30T10:00:01.000Z",
      updatedAt: "2026-10-31T10:00:00.000Z",
    }]);
    expect(result.avgResolutionTimeMs).toBe(1000);
  });
});

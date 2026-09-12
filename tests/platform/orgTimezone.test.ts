import { describe, expect, it } from "vitest";
import { formatInOrgTimezone, formatPlatformTimestamp } from "@/lib/platform/formatting/orgTimezone";

// A fixed instant: 2026-01-15T18:30:00Z. Chosen deliberately so UTC and
// Asia/Kolkata (+5:30) land on different calendar days in local time when
// combined with a late-evening UTC hour — a real edge case Hard Rule 12's
// midnight-boundary requirement (Phase 11 Part 4) names explicitly.
const FIXED_INSTANT = "2026-01-15T18:30:00.000Z";

describe("Hard Rule 12 — formatInOrgTimezone", () => {
  it("renders the organisation's own timezone, not UTC, when one is set", () => {
    const inKolkata = formatInOrgTimezone(FIXED_INSTANT, "Asia/Kolkata");
    // 18:30 UTC + 5:30 = 00:00 the NEXT calendar day in Asia/Kolkata.
    expect(inKolkata).toContain("16"); // 16 Jan in Asia/Kolkata
    // ICU renders this environment's short zone name as "GMT+5:30" rather than "IST" —
    // either is a real named zone, neither is the bare, zone-less UTC fallback.
    expect(inKolkata).not.toContain("UTC");
    expect(inKolkata).toMatch(/GMT|IST/);
  });

  it("names the zone in the output — never a bare timestamp with an implied zone", () => {
    const inNewYork = formatInOrgTimezone(FIXED_INSTANT, "America/New_York");
    expect(inNewYork).toMatch(/[A-Z]{2,5}(?:[+-]\d{1,2}(?::\d{2})?)?$/); // a zone abbreviation or GMT offset at the end
  });

  it("two different organisation timezones produce two different displayed times for the same instant", () => {
    const inTokyo = formatInOrgTimezone(FIXED_INSTANT, "Asia/Tokyo");
    const inLosAngeles = formatInOrgTimezone(FIXED_INSTANT, "America/Los_Angeles");
    expect(inTokyo).not.toBe(inLosAngeles);
  });

  it("falls back to UTC (never the caller's local zone) when timezone is missing", () => {
    const result = formatInOrgTimezone(FIXED_INSTANT, undefined);
    expect(result).toContain("UTC");
  });

  it("falls back to UTC when the stored timezone string is invalid — never throws", () => {
    expect(() => formatInOrgTimezone(FIXED_INSTANT, "Not/A/Real/Zone")).not.toThrow();
    expect(formatInOrgTimezone(FIXED_INSTANT, "Not/A/Real/Zone")).toContain("UTC");
  });

  it("an invalid date input returns a safe placeholder, never 'Invalid Date'", () => {
    expect(formatInOrgTimezone("not-a-date", "UTC")).toBe("—");
  });

  it("dateOnly omits the time-of-day portion", () => {
    const withTime = formatInOrgTimezone(FIXED_INSTANT, "UTC");
    const dateOnly = formatInOrgTimezone(FIXED_INSTANT, "UTC", { dateOnly: true });
    expect(dateOnly.length).toBeLessThan(withTime.length);
  });

  it("accepts a real Date object, not just an ISO string", () => {
    expect(() => formatInOrgTimezone(new Date(FIXED_INSTANT), "Asia/Kolkata")).not.toThrow();
  });
});

describe("formatPlatformTimestamp — cross-tenant surfaces are explicitly UTC, never a silent local zone", () => {
  it("always renders UTC regardless of what timezone the caller might pass elsewhere", () => {
    expect(formatPlatformTimestamp(FIXED_INSTANT)).toContain("UTC");
  });
});

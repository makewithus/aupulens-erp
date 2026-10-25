import { describe, expect, it } from "vitest";
import { isValidDateOnly } from "@/lib/accounting/reportDate";
import { toDateEndInTimeZone, toDateStartInTimeZone } from "@/lib/accounting/reports";

describe("isValidDateOnly", () => {
  it("accepts real calendar dates and rejects malformed or impossible dates", () => {
    expect(isValidDateOnly("2026-03-31")).toBe(true);
    expect(isValidDateOnly("2024-02-29")).toBe(true);
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2026-13-01")).toBe(false);
    expect(isValidDateOnly("31-03-2026")).toBe(false);
  });
});

describe("toDateEndInTimeZone", () => {
  it("ends the selected calendar date in the organization timezone", () => {
    const date = new Date("2026-03-31T00:00:00.000Z");
    expect(toDateEndInTimeZone(date, "Asia/Kolkata").toISOString())
      .toBe("2026-03-31T18:29:59.999Z");
    expect(toDateEndInTimeZone(date, "UTC").toISOString())
      .toBe("2026-03-31T23:59:59.999Z");
  });

  it("uses the correct daylight-saving offset at the end of the selected date", () => {
    const date = new Date("2026-03-08T00:00:00.000Z");
    expect(toDateEndInTimeZone(date, "America/New_York").toISOString())
      .toBe("2026-03-09T03:59:59.999Z");
  });

  it("falls back to UTC for an invalid legacy organization timezone", () => {
    expect(toDateEndInTimeZone(new Date("2026-03-31T00:00:00.000Z"), "Invalid/Zone").toISOString())
      .toBe("2026-03-31T23:59:59.999Z");
  });
});

describe("toDateStartInTimeZone", () => {
  it("starts the selected calendar date at 00:00:00 in the organization timezone", () => {
    const date = new Date("2026-10-01T00:00:00.000Z");
    // In Asia/Kolkata (UTC+5:30), 2026-10-01 00:00:00 local is 2026-09-30 18:30:00 UTC
    expect(toDateStartInTimeZone(date, "Asia/Kolkata").toISOString())
      .toBe("2026-09-30T18:30:00.000Z");
    expect(toDateStartInTimeZone(date, "UTC").toISOString())
      .toBe("2026-10-01T00:00:00.000Z");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(toDateStartInTimeZone(new Date("2026-10-01T00:00:00.000Z"), "Invalid/Zone").toISOString())
      .toBe("2026-10-01T00:00:00.000Z");
  });
});


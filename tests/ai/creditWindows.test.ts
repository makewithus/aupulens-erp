import { describe, expect, it } from "vitest";
import { getAiCreditWindows } from "@/lib/platform/ai/creditWindows";
import { PLAN_DEFINITIONS } from "@/lib/platform/entitlements/planCatalog";
import { PLAN_KEY } from "@/lib/constants/statuses";

describe("plan weighted-credit windows", () => {
  it("matches the Trial, Pro, and Business allowances in the plan schedule", () => {
    expect(PLAN_DEFINITIONS[PLAN_KEY.FREE].features).toMatchObject({ aiCreditsPerSession: 20, aiCreditsPerWeek: 100 });
    expect(PLAN_DEFINITIONS[PLAN_KEY.PRO].features).toMatchObject({ aiCreditsPerSession: 100, aiCreditsPerWeek: 500 });
    expect(PLAN_DEFINITIONS[PLAN_KEY.BUSINESS].features).toMatchObject({ aiCreditsPerSession: 250, aiCreditsPerWeek: 1500 });
  });

  it("creates a five-hour UTC session and a Monday-to-Monday weekly bucket", () => {
    const windows = getAiCreditWindows(new Date("2026-10-19T13:42:00.000Z"), { aiCreditsPerSession: 100, aiCreditsPerWeek: 500 });
    expect(windows).toMatchObject([
      { kind: "session", start: new Date("2026-10-19T10:00:00.000Z"), end: new Date("2026-10-19T15:00:00.000Z"), limit: 100 },
      { kind: "weekly", start: new Date("2026-10-19T00:00:00.000Z"), end: new Date("2026-10-26T00:00:00.000Z"), limit: 500 },
    ]);
  });

  it("starts fresh buckets at their boundary and honors configured plan values", () => {
    const windows = getAiCreditWindows(new Date("2026-10-26T00:00:00.000Z"), { aiCreditsPerSession: 250, aiCreditsPerWeek: 1500 });
    expect(windows[0].limit).toBe(250);
    expect(windows[1].limit).toBe(1500);
    expect(windows[1].start.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});

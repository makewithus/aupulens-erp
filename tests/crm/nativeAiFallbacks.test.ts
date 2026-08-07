/**
 * Deterministic-fallback tests for the three Native ERP AI functionalities
 * that gained an AI layer in this pass (win probability, data completion,
 * duplicate detection). These cover the pure/deterministic behaviour that must
 * hold even with AI disabled — the live AI paths are exercised separately by
 * scripts/verify-native-ai.ts against real gpt-4o.
 */
import { describe, it, expect, vi } from "vitest";

// Importing these modules pulls in @/lib/ai/tenantAi -> @/lib/db, whose
// top-level guard throws without MONGODB_URI. Mock the DB layer so the pure
// functions can be imported and tested in isolation.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/Organization", () => ({ default: function Organization() {} }));

import { calculateWinProbability } from "@/lib/crm/winProbability";
import { missingFieldsForLead } from "@/lib/crm/dataCompletion";
import { detectDuplicates } from "@/lib/crm/ai/duplicateAssistant";

describe("calculateWinProbability (deterministic fallback)", () => {
  it("returns 100 for Closed Won and 0 for Closed Lost", () => {
    expect(calculateWinProbability({ stage: "Closed Won" })).toBe(100);
    expect(calculateWinProbability({ stage: "Closed Lost" })).toBe(0);
  });

  it("blends stage baseline with the stored probability", () => {
    // Negotiation baseline 75, stored 60 -> avg 68 (67.5 rounded).
    expect(calculateWinProbability({ stage: "Negotiation", probability: 60 })).toBe(68);
  });

  it("penalises an overdue expected close date", () => {
    const past = new Date(Date.now() - 10 * 864e5);
    const onTime = calculateWinProbability({ stage: "Negotiation", probability: 60 });
    const overdue = calculateWinProbability({ stage: "Negotiation", probability: 60, expected_close_date: past });
    expect(overdue).toBe(onTime - 15);
  });

  it("clamps to 0..100 and defaults an unknown stage sensibly", () => {
    const v = calculateWinProbability({ stage: "Some New Stage" });
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

describe("missingFieldsForLead (deterministic completion detection)", () => {
  it("lists only the empty key fields", () => {
    const lead = { company_name: "Acme", budget_range: "", email: "a@b.com", phone: null, expected_timeline: undefined };
    const missing = missingFieldsForLead(lead).map((m) => m.field);
    expect(missing).toEqual(expect.arrayContaining(["budget_range", "phone", "expected_timeline"]));
    expect(missing).not.toContain("company_name");
    expect(missing).not.toContain("email");
  });

  it("returns [] when everything is present", () => {
    const lead = { company_name: "Acme", budget_range: "10k", email: "a@b.com", phone: "123", expected_timeline: "Q3" };
    expect(missingFieldsForLead(lead)).toEqual([]);
  });
});

describe("detectDuplicates (deterministic matcher used as the fallback)", () => {
  it("flags an exact email match on a Lead", () => {
    const rec = { _id: "1", email: "same@x.com", lead_name: "Jo" };
    const existing = [{ _id: "2", email: "SAME@x.com", lead_name: "Different Name" }];
    const dupes = detectDuplicates(rec, existing, "Lead");
    expect(dupes.length).toBe(1);
    expect(dupes[0].recordId).toBe("2");
  });

  it("does NOT flag semantically-equal but textually-distant names (that's the AI layer's job)", () => {
    const rec = { _id: "1", company_name: "IBM" };
    const existing = [{ _id: "2", company_name: "International Business Machines" }];
    // Levenshtein distance is large -> deterministic matcher correctly abstains.
    expect(detectDuplicates(rec, existing, "Account")).toEqual([]);
  });
});

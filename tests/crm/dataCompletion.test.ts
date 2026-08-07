import { describe, it, expect, vi } from "vitest";

// analyzeLeadCompleteness is pure, but the module now also exposes an AI
// completion layer that imports @/lib/ai/tenantAi -> @/lib/db (whose top-level
// guard throws without MONGODB_URI). Mock the DB so the pure function imports.
vi.mock("@/lib/db", () => ({ default: vi.fn() }));
vi.mock("@/models/Organization", () => ({ default: function Organization() {} }));

import { analyzeLeadCompleteness } from "@/lib/crm/dataCompletion";

describe("analyzeLeadCompleteness", () => {
  it("reports 100% health and zero missing fields for fully complete leads", () => {
    const leads = [
      { company_name: "Acme", budget_range: "10k-50k", email: "a@acme.com", phone: "123", expected_timeline: "Q1" },
    ];
    const result = analyzeLeadCompleteness(leads);
    expect(result.healthPercent).toBe(100);
    expect(result.missingFieldCount).toBe(0);
    expect(result.completeRecords).toBe(1);
  });

  it("counts missing fields per-field and overall", () => {
    const leads = [
      { company_name: "Acme", email: "a@acme.com" }, // missing budget_range, phone, expected_timeline
      { company_name: "", email: "" }, // missing everything except phone/timeline also empty
    ];
    const result = analyzeLeadCompleteness(leads);
    expect(result.totalRecords).toBe(2);
    expect(result.missingByField["Budget Range"]).toBe(2);
    expect(result.missingByField["Company Name"]).toBe(1); // only the second is empty string
    expect(result.completeRecords).toBe(0);
  });

  it("returns 100% health for an empty record set (no fields to be missing)", () => {
    const result = analyzeLeadCompleteness([]);
    expect(result.healthPercent).toBe(100);
    expect(result.totalRecords).toBe(0);
  });

  it("treats undefined, null, and empty string all as missing", () => {
    const leads = [{ company_name: undefined, budget_range: null, email: "", phone: "555", expected_timeline: "Q2" }];
    const result = analyzeLeadCompleteness(leads);
    expect(result.missingFieldCount).toBe(3);
  });
});

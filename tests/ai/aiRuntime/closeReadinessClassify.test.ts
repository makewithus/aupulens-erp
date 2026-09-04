import { describe, expect, it } from "vitest";
import { classifyBlockerSeverity, classifyReadiness } from "@/lib/aiRuntime/closeReadiness/classify";

describe("classifyBlockerSeverity — pure, fixture matrix (docs/ai/BRIEF-04-BATCH-C.md AI-13)", () => {
  it("isHard → always hard_blocker, regardless of amount/materiality", () => {
    expect(classifyBlockerSeverity({ isHard: true, ageDays: 0, materialityConfigured: false })).toBe("hard_blocker");
    expect(classifyBlockerSeverity({ isHard: true, amount: 1, ageDays: 0, materialityConfigured: true, materialityThreshold: 1000000 })).toBe("hard_blocker");
  });

  it("materiality not configured → unclassified, never minor_exception (A.4)", () => {
    expect(classifyBlockerSeverity({ isHard: false, amount: 1, ageDays: 0, materialityConfigured: false })).toBe("unclassified");
  });

  it("material and stale → escalates to hard_blocker", () => {
    expect(classifyBlockerSeverity({ isHard: false, amount: 10000, ageDays: 45, materialityConfigured: true, materialityThreshold: 5000, staleDaysThreshold: 30 })).toBe("hard_blocker");
  });

  it("material, not stale → material_exception", () => {
    expect(classifyBlockerSeverity({ isHard: false, amount: 10000, ageDays: 5, materialityConfigured: true, materialityThreshold: 5000, staleDaysThreshold: 30 })).toBe("material_exception");
  });

  it("stale, not material → stale", () => {
    expect(classifyBlockerSeverity({ isHard: false, amount: 1, ageDays: 45, materialityConfigured: true, materialityThreshold: 5000, staleDaysThreshold: 30 })).toBe("stale");
  });

  it("neither material nor stale → minor_exception", () => {
    expect(classifyBlockerSeverity({ isHard: false, amount: 1, ageDays: 1, materialityConfigured: true, materialityThreshold: 5000, staleDaysThreshold: 30 })).toBe("minor_exception");
  });
});

describe("classifyReadiness — pure rollup (docs/ai/BRIEF-04-BATCH-C.md AI-13)", () => {
  it("a single unclassified blocker anywhere → indeterminate, never ready (A.4)", () => {
    const result = classifyReadiness([{ status: "at_risk", blockers: [{ severity: "unclassified" }] }]);
    expect(result.status).toBe("indeterminate");
  });

  it("no blockers anywhere → ready", () => {
    const result = classifyReadiness([{ status: "ready", blockers: [] }]);
    expect(result.status).toBe("ready");
  });

  it("a hard_blocker → blocked", () => {
    const result = classifyReadiness([{ status: "blocked", blockers: [{ severity: "hard_blocker" }] }]);
    expect(result.status).toBe("blocked");
  });

  it("a material_exception with no hard_blocker → at_risk", () => {
    const result = classifyReadiness([{ status: "at_risk", blockers: [{ severity: "material_exception" }] }]);
    expect(result.status).toBe("at_risk");
  });

  it("not_checked domains counted separately, never treated as ready or blocking", () => {
    const result = classifyReadiness([
      { status: "ready", blockers: [] },
      { status: "not_checked", blockers: [] },
      { status: "not_applicable", blockers: [] },
    ]);
    expect(result.status).toBe("ready");
    expect(result.domainsNotChecked).toBe(1);
  });

  it("determinism: identical input produces an identical result", () => {
    const domains = [{ status: "at_risk", blockers: [{ severity: "material_exception" as const }, { severity: "stale" as const }] }];
    const first = classifyReadiness(domains);
    const second = classifyReadiness(domains);
    expect(first).toEqual(second);
  });
});

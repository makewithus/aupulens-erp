import { describe, expect, it } from "vitest";
import { classifyReconciliationStatus } from "@/lib/aiRuntime/reconciliation/classify";
import type { ReconciliationDifference } from "@/lib/aiRuntime/reconciliation/types";

const evidence: ReconciliationDifference["evidence"] = [];

describe("classifyReconciliationStatus — the structural false-completion guard (docs/ai/BRIEF-04-BATCH-C.md AI-22)", () => {
  it("zero difference, no differences → reconciled", () => {
    expect(classifyReconciliationStatus(0, 0.01, [])).toBe("reconciled");
  });

  it("difference of one unit outside tolerance → unreconciled", () => {
    expect(classifyReconciliationStatus(1, 0.01, [])).toBe("unreconciled");
  });

  it("a classified, owned, in-tolerance difference → reconciled_with_exceptions, never reconciled", () => {
    const differences: ReconciliationDifference[] = [{ type: "timing", amount: 0.005, ageDays: 1, cause: "timing", owner: "finance", evidence }];
    expect(classifyReconciliationStatus(0.005, 0.01, differences)).toBe("reconciled_with_exceptions");
  });

  it("an unexplained difference can never produce reconciled, at any tolerance — even a huge one", () => {
    const differences: ReconciliationDifference[] = [{ type: "unexplained", amount: 0.001, ageDays: 0, cause: "unknown", evidence }];
    expect(classifyReconciliationStatus(0.001, 1_000_000, differences)).toBe("unreconciled");
  });

  it("mixed differences — one explained, one unexplained → still unreconciled", () => {
    const differences: ReconciliationDifference[] = [
      { type: "timing", amount: 1, ageDays: 1, cause: "timing", owner: "finance", evidence },
      { type: "unexplained", amount: 1, ageDays: 1, cause: "unknown", evidence },
    ];
    expect(classifyReconciliationStatus(2, 100, differences)).toBe("unreconciled");
  });
});

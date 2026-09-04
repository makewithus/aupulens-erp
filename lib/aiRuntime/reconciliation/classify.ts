import type { ReconciliationDifference, ReconciliationStatus } from "@/lib/aiRuntime/reconciliation/types";

/**
 * The one structurally load-bearing piece of AI-22's engine (docs/ai/BRIEF-04-BATCH-C.md,
 * AI-22 algorithm step 6): **`"reconciled"` is unreachable if any difference is `"unexplained"`,
 * or if the net difference exceeds tolerance — no matter how the caller got here.** This is a
 * pure function, deliberately separated from every definition's own `run()`, so a definition
 * author cannot accidentally special-case their way past it, and so it can be tested directly
 * against a synthetic difference list rather than only indirectly through a full definition run.
 */
export function classifyReconciliationStatus(
  difference: number,
  tolerance: number,
  differences: ReconciliationDifference[],
): ReconciliationStatus {
  const hasUnexplained = differences.some((d) => d.type === "unexplained");
  if (hasUnexplained) return "unreconciled";
  if (Math.abs(difference) > tolerance) return "unreconciled";
  if (differences.length > 0) return "reconciled_with_exceptions";
  return "reconciled";
}

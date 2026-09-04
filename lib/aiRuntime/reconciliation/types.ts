/**
 * AI-22's continuous reconciliation controller (docs/ai/BRIEF-04-BATCH-C.md) — "one engine, many
 * definitions." Each definition is data plus a `run()` that computes its own totals/differences;
 * the one piece genuinely shared and load-bearing is `classifyReconciliationStatus()` in
 * `classify.ts` — a pure function that structurally cannot return `"reconciled"` with an
 * unexplained item in scope, tested directly (not just relied on via a caller's own check).
 */

export type ReconciliationStatus = "reconciled" | "reconciled_with_exceptions" | "unreconciled" | "not_implemented" | "not_applicable";

export type ReconciliationDifferenceType = "timing" | "error" | "missing_left" | "missing_right" | "fx" | "rounding" | "duplicate" | "unexplained";

export interface ReconciliationLineItem {
  ref: string;
  amount: number;
  date?: Date;
  description?: string;
}

export interface ReconciliationDifference {
  type: ReconciliationDifferenceType;
  amount: number;
  ageDays: number;
  cause: string;
  owner?: string;
  evidence: { kind: "record" | "document" | "calculation"; ref: string; label: string }[];
}

export interface ReconciliationResult {
  definitionId: string;
  name: string;
  period: string;
  status: ReconciliationStatus;
  leftTotal: number;
  rightTotal: number;
  difference: number;
  tolerance: number;
  matchedCount: number;
  unmatchedLeft: ReconciliationLineItem[];
  unmatchedRight: ReconciliationLineItem[];
  differences: ReconciliationDifference[];
  oldestOpenItemDays: number;
  materialityConfigured: boolean;
  owner: string;
  notImplementedReason?: string;
}

export interface ReconciliationDefinition {
  id: string;
  name: string;
  owner: string;
  /** `null` marks a definition as not yet implemented — `run()` is never called, `reason` is
   *  surfaced verbatim as `notImplementedReason` in the output. */
  run: ((tenantId: string, periodEnd: Date, tolerance: number, materialityConfigured: boolean) => Promise<Omit<ReconciliationResult, "definitionId" | "name" | "period" | "tolerance" | "owner" | "materialityConfigured">>) | null;
  notImplementedReason?: string;
  defaultTolerance: number;
}

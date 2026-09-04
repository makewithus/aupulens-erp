/**
 * AI-29's control-testing engine (docs/ai/BRIEF-07-BATCH-F.md A.4) — mirrors AI-22's
 * reconciliation architecture exactly: "one engine, many definitions." Each control is data plus
 * two functions (`population`, `test`); the engine is generic and never special-cased per
 * control. Same `not_implemented` honesty pattern as `lib/aiRuntime/reconciliation/definitions.ts`.
 */

export type ControlStatus = "implemented" | "not_implemented" | "partial";
export type ControlSeverity = "critical" | "high" | "medium" | "low";

export interface ControlEvidence {
  kind: "record" | "document" | "calculation";
  ref: string;
  label: string;
}

export interface ControlTestResult {
  passed: boolean;
  detail: string;
  evidence: ControlEvidence[];
}

export interface ControlDefinition<TItem = unknown> {
  id: string;
  description: string;
  status: ControlStatus;
  /** Required when status is "not_implemented" or "partial" — exactly what can't be checked. */
  reasonIfLimited?: string;
  severity: ControlSeverity;
  remediationOwner: string;
  frequency: "continuous" | "daily" | "monthly";
  /** `null` for not_implemented controls — population is never evaluated for them. */
  population: ((tenantId: string, periodStart: Date, periodEnd: Date) => Promise<TItem[]>) | null;
  test: ((item: TItem) => Promise<ControlTestResult> | ControlTestResult) | null;
  refOf: (item: TItem) => string;
  labelOf: (item: TItem) => string;
}

export interface ControlException {
  ref: string;
  detail: string;
  severity: ControlSeverity;
  evidence: ControlEvidence[];
  owner: string;
  status: "open";
}

export interface ControlRunResult {
  controlId: string;
  description: string;
  status: ControlStatus;
  reasonIfLimited?: string;
  populationSize: number;
  tested: number;
  passed: number;
  failed: number;
  failureRate: number;
  exceptions: ControlException[];
}

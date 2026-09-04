import { PERIOD_CLOSING_STATUS } from "@/lib/constants/statuses";
import type { IAiCloseDomain } from "@/models/ai/AiCloseState";

/**
 * The pure core of AI-24's assertion evaluation — deliberately its own dependency-free module.
 *
 * `lib/aiRuntime/evidence/assertions.ts` (AI-24's own entry point) needs
 * `lib/aiRuntime/closeReadiness/compute.ts::computeCloseReadiness()` to get fresh domain data.
 * `compute.ts` needs to run this SAME assertion logic to derive its own `evidence` domain
 * (docs/ai/BRIEF-05-BATCH-D.md Part 0.4 — wiring AI-24 into AI-13's recompute). Those two
 * requirements are directly circular if `compute.ts` imports from `assertions.ts` (which imports
 * `compute.ts`) — so the actual derivation logic lives here, with no dependency on either file;
 * `assertions.ts` and `lib/aiRuntime/closeReadiness/domains.ts` both import only from here.
 */

export interface AssertionDefinition {
  item: string;
  description: string;
  domain: string;
  /** `PeriodClosing.status` values at or past which a human has implicitly claimed this item is
   *  done — used to detect a contradiction (this assertion still failing) without mutating
   *  `PeriodClosing` itself (A.2 / Hard Rule 4). */
  gatedByStatus: string[];
}

export const CLOSE_ASSERTIONS: AssertionDefinition[] = [
  { item: "transactions_posted", description: "No unposted journal entries or dead-lettered AI events", domain: "transactions", gatedByStatus: [PERIOD_CLOSING_STATUS.LOCKED, PERIOD_CLOSING_STATUS.ACCRUALS_POSTED, PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "bank_reconciled", description: "Bank account ties to GL with no unexplained exceptions", domain: "bank", gatedByStatus: [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "ar_reconciled", description: "AR subledger ties to the receivable control account", domain: "ar_finance", gatedByStatus: [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "ap_reconciled", description: "AP subledger ties to the payable control account", domain: "ap", gatedByStatus: [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "accruals_posted", description: "No stale accrual reversals or open GRNI candidates", domain: "accruals", gatedByStatus: [PERIOD_CLOSING_STATUS.ACCRUALS_POSTED, PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "prepaids_current", description: "Prepaid schedules have no overdue recognition periods", domain: "prepaids", gatedByStatus: [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "revenue_current", description: "Deferred revenue schedules tie to GL", domain: "revenue", gatedByStatus: [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "fixed_assets_tied", description: "Fixed asset register ties to GL and depreciation has run", domain: "fixed_assets", gatedByStatus: [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "payroll_tied", description: "Payroll runs tie to their posted journal entries", domain: "payroll", gatedByStatus: [PERIOD_CLOSING_STATUS.RECONCILED, PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
  { item: "controls_clear", description: "No journal entries pending a required approval", domain: "controls", gatedByStatus: [PERIOD_CLOSING_STATUS.CLOSED, PERIOD_CLOSING_STATUS.STATEMENTS_GENERATED] },
];

export interface AssertionEvaluation {
  item: string;
  assertionId: string;
  assertionDescription: string;
  verified: boolean;
  evidence: { kind: "record" | "document" | "calculation"; ref: string; label: string }[];
  missing: string[];
  owner?: string;
  contradiction: boolean;
}

function domainVerified(domain: IAiCloseDomain | undefined): boolean {
  if (!domain) return false;
  return domain.status === "ready" || domain.status === "not_applicable";
}

/** Pure: no DB reads, no imports of `compute.ts` or `assertions.ts`. Given the domains AI-13
 *  already computed (every domain except `evidence` itself) and the read-only `PeriodClosing`
 *  status, derives every assertion's verified/missing/contradiction state. */
export function deriveAssertions(domains: IAiCloseDomain[], periodClosingStatus: string | undefined): AssertionEvaluation[] {
  return CLOSE_ASSERTIONS.map((def) => {
    const domain = domains.find((d) => d.domain === def.domain);
    const verified = domainVerified(domain);
    const evidence = domain?.blockers.flatMap((b) => b.evidence) ?? [];
    const missing = verified ? [] : (domain?.blockers.map((b) => b.title) ?? [domain?.reasonIfNotChecked ?? "no data"]);
    const gated = periodClosingStatus ? def.gatedByStatus.includes(periodClosingStatus) : false;
    return {
      item: def.item,
      assertionId: `ai24-${def.item}`,
      assertionDescription: def.description,
      verified,
      evidence,
      missing,
      owner: domain?.blockers[0]?.owner,
      contradiction: gated && !verified,
    };
  });
}

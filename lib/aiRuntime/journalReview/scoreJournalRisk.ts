import { isManualJournalToSensitiveAccount, SENSITIVE_ACCOUNT_TYPES, SENSITIVE_GROUPS } from "@/lib/aiRuntime/journalPatterns/sensitiveAccountPattern";
import { isWeekendOrAfterHours, backdatedDays, BACKDATED_THRESHOLD_DAYS } from "@/lib/aiRuntime/journalPatterns/timingPatterns";
import type { SodVerdict } from "@/lib/aiRuntime/journalPatterns/sod";
import type { TenantJournalBaseline } from "@/lib/aiRuntime/journalReview/tenantBaseline";

/**
 * AI-23's journal risk score (docs/ai/BRIEF-07-BATCH-F.md, AI-23) — a pure function over
 * already-fetched data, no DB/tool calls inside (those happen in the workflow's `act()`, which
 * alone has `rt`). Pulls the pattern signals AI-15 already detects (sensitive-account,
 * weekend/after-hours, backdated — `lib/aiRuntime/journalPatterns/`, never re-derived) and adds
 * AI-23's own tenant-baseline dimensions on top: unusual account combination, out-of-range
 * amount, threshold proximity, thin description, reversal, rare poster, SoD.
 *
 * **Never a bare score** — `recommendation` always carries `reasons[]` naming the specific flags,
 * per A.3's "risk 0.82 tells a reviewer nothing" instruction.
 *
 * **"Round-number amounts" (the brief's own listed dimension) was tried and deliberately
 * removed**: as a standalone check it flags every ordinary ₹1000/₹5000/₹10000 sale a normal
 * business posts constantly — caught by this file's own false-positive test, which is exactly the
 * failure mode this dimension would otherwise have shipped. A real version needs the account's own
 * historical amount distribution to judge "round AND unusual for this account," which
 * `amount_outside_normal_range` (the z-score check below) already does more honestly — so this
 * stays folded into that dimension rather than existing twice.
 */

export type JournalRiskSeverity = "low" | "medium" | "high";
export type JournalRiskRecommendation = "auto_ok" | "review" | "escalate";

export interface JournalRiskFlag {
  dimension: string;
  detail: string;
  severity: JournalRiskSeverity;
  baselineComparison?: string;
}

export interface JournalLineInput {
  accountId: string;
  accountType: string;
  internalGroup: string;
  accountName: string;
  label: string;
  amount: number;
}

export interface JournalRiskInput {
  entryId: string;
  entryName: string;
  journalType: string;
  entryDate: Date;
  createdAt: Date;
  createdBy: string | null;
  approvedBy: string | null;
  isReversed: boolean;
  reversedEntryId: string | null;
  amountTotal: number;
  lines: JournalLineInput[];
  approvalThresholdAmount: number;
  approvalsEnabled: boolean;
  sodVerdict: SodVerdict;
  aiOrigin: { workflowId: string; workflowVersion: string; confidence?: number; policyOverrides?: number } | null;
  baseline: TenantJournalBaseline;
}

export interface JournalRiskResult {
  riskScore: number;
  scoreComponents: Record<string, number>;
  flags: JournalRiskFlag[];
  recommendation: JournalRiskRecommendation;
  reasons: string[];
}

const SEVERITY_WEIGHT: Record<JournalRiskSeverity, number> = { low: 0.1, medium: 0.25, high: 0.45 };

function accountCombinationKey(accountIds: string[]): string {
  return [...new Set(accountIds)].sort().join("|");
}

export function scoreJournalRisk(input: JournalRiskInput): JournalRiskResult {
  const flags: JournalRiskFlag[] = [];
  const scoreComponents: Record<string, number> = {};

  const addFlag = (f: JournalRiskFlag) => {
    flags.push(f);
    scoreComponents[f.dimension] = SEVERITY_WEIGHT[f.severity];
  };

  // ── Reused from AI-15 (never re-derived) ──
  for (const line of input.lines) {
    if (isManualJournalToSensitiveAccount(input.journalType, line.accountType, line.internalGroup)) {
      addFlag({ dimension: "manual_journal_to_sensitive_account", detail: `Manual entry to ${line.accountName}`, severity: "high" });
      break; // one flag per journal for this dimension, not one per line
    }
  }
  const timing = isWeekendOrAfterHours(input.createdAt);
  if (timing.flagged) {
    const sensitive = input.lines.some((l) => SENSITIVE_ACCOUNT_TYPES.has(l.accountType) || SENSITIVE_GROUPS.has(l.internalGroup));
    addFlag({ dimension: "weekend_or_after_hours_posting", detail: timing.isWeekend ? "Posted on a weekend" : `Posted at ${timing.hour}:00 UTC`, severity: sensitive ? "high" : "low" });
  }
  const backdated = backdatedDays(input.createdAt, input.entryDate);
  if (backdated >= BACKDATED_THRESHOLD_DAYS) {
    addFlag({ dimension: "backdated_posting", detail: `${backdated} days backdated`, severity: "medium" });
  }

  // ── AI-23's own dimensions ──
  if (input.sodVerdict.conflict) {
    addFlag({ dimension: "sod_preparer_approver", detail: input.sodVerdict.reason, severity: "high" });
  }

  if (input.approvalsEnabled && input.approvalThresholdAmount > 0) {
    const ratio = input.amountTotal / input.approvalThresholdAmount;
    if (ratio >= 0.8 && ratio < 1) {
      addFlag({ dimension: "amount_near_approval_threshold", detail: `${input.amountTotal} is ${Math.round(ratio * 100)}% of the ${input.approvalThresholdAmount} approval threshold`, severity: "medium", baselineComparison: `threshold ${input.approvalThresholdAmount}` });
    }
  }

  const hasDescription = input.lines.some((l) => (l.label ?? "").trim().length >= 5);
  if (!hasDescription) {
    addFlag({ dimension: "thin_or_missing_description", detail: "No line carries a description of 5+ characters", severity: "medium" });
  }

  if (input.isReversed || input.reversedEntryId) {
    addFlag({ dimension: "reversal", detail: input.reversedEntryId ? `Reverses entry ${input.reversedEntryId}` : "This entry has been reversed", severity: "low" });
  }

  if (input.createdBy) {
    const posterCount = input.baseline.posterJournalCounts.get(input.createdBy) ?? 0;
    if (input.baseline.totalPostedJournals >= 10 && posterCount <= 1) {
      addFlag({ dimension: "rare_poster", detail: `This user has posted ${posterCount} other journal(s) in the trailing history`, severity: "medium", baselineComparison: `tenant posts ${input.baseline.totalPostedJournals} journal(s) historically` });
    }
  }

  const combinationKey = accountCombinationKey(input.lines.map((l) => l.accountId));
  const combinationCount = input.baseline.accountCombinationCounts.get(combinationKey) ?? 0;
  if (input.baseline.totalPostedJournals >= 10 && combinationCount === 0) {
    addFlag({ dimension: "unusual_account_combination", detail: "This exact set of accounts has not been combined in a journal before", severity: "medium", baselineComparison: `0 of ${input.baseline.totalPostedJournals} historical journal(s)` });
  }

  for (const line of input.lines) {
    const stats = input.baseline.accountAmountStats.get(line.accountId);
    if (stats && stats.sampleSize >= 5 && stats.stdDev > 0) {
      const z = Math.abs(line.amount - stats.mean) / stats.stdDev;
      if (z >= 3) {
        addFlag({ dimension: "amount_outside_normal_range", detail: `${line.amount} on ${line.accountName} is ${z.toFixed(1)} standard deviations from this tenant's own mean (${stats.mean.toFixed(2)})`, severity: "medium", baselineComparison: `mean ${stats.mean.toFixed(2)}, stddev ${stats.stdDev.toFixed(2)}, n=${stats.sampleSize}` });
        break;
      }
    }
  }

  // AI-created journal, low confidence let through by a policy override — escalates, not de-escalates.
  if (input.aiOrigin && (input.aiOrigin.confidence ?? 1) < 0.6) {
    addFlag({ dimension: "low_confidence_ai_proposal", detail: `${input.aiOrigin.workflowId} proposed this at confidence ${input.aiOrigin.confidence}`, severity: "medium" });
  }
  if (input.aiOrigin && (input.aiOrigin.policyOverrides ?? 0) > 0) {
    addFlag({ dimension: "ai_policy_override", detail: `${input.aiOrigin.policyOverrides} policy override(s) let this AI proposal through`, severity: "high" });
  }

  const riskScore = Math.min(1, Object.values(scoreComponents).reduce((s, v) => s + v, 0));
  const hasHigh = flags.some((f) => f.severity === "high");
  const recommendation: JournalRiskRecommendation = hasHigh || riskScore >= 0.6 ? "escalate" : flags.length > 0 ? "review" : "auto_ok";
  const reasons = flags.map((f) => f.detail);

  return { riskScore: Math.round(riskScore * 100) / 100, scoreComponents, flags, recommendation, reasons };
}

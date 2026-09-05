import { annotateStatement, type AnnotatedStatement } from "@/lib/aiRuntime/statements/annotateStatement";
import { AI_AUTONOMY_LEVEL, AI_FINDING_TYPE, AI_FINDING_SEVERITY } from "@/lib/constants/statuses";
import type { WorkflowDefinition, ObservedResult, ReasonResult, ActResult, VerifyResult } from "@/lib/aiRuntime/workflows/types";

/**
 * AI-21 — Financial statement intelligence (docs/ai/BRIEF-06-BATCH-E.md). Never modifies a
 * ledger value or a report figure — an annotation layer only, `lib/aiRuntime/statements/
 * annotateStatement.ts` does all the real work, wrapping `buildPostedJournalReport()` verbatim.
 * OBSERVE, no tool calls in `act()` (asserted directly — no ledger-value write path exists
 * anywhere in this workflow's folder, same source-grep pattern as AI-09/AI-13).
 *
 * The headline output: unsupported material lines — a line big enough to matter with a real,
 * machine-detected reconciliation failure behind it. "The thing an auditor asks for first."
 */

interface Ai21Raw {
  period: string;
}

interface Ai21Extracted {
  period: string;
  balanceSheet: AnnotatedStatement;
  incomeStatement: AnnotatedStatement;
}

interface Ai21Proposal {
  period: string;
  balanceSheet: AnnotatedStatement;
  incomeStatement: AnnotatedStatement;
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const ai21StatementIntelligence: WorkflowDefinition<Ai21Raw, Ai21Extracted, Ai21Proposal> = {
  id: "AI-21",
  version: "1.0.0",
  eventKeys: ["period.horizon.reached", "ai.sweep.hourly"],
  actionClass: "read_only",
  defaultAutonomy: AI_AUTONOMY_LEVEL.OBSERVE,

  subscriptionFilter(): boolean {
    return true; // fan-out, same as AI-13/AI-17/AI-22
  },

  async observe(event): Promise<ObservedResult<Ai21Raw>> {
    // A missing or malformed period must never reach annotateStatement()'s monthBounds() as a
    // literal "undefined" or arbitrary string — that produces Date.UTC(NaN, ...) → an Invalid
    // Date → an uncaught Mongoose CastError on JournalEntry.find() (a real bug found in this
    // pass, see this workflow's own verification record §9). "This period" (the current
    // calendar month, UTC) is the correct, non-invented default for a statement run triggered
    // with no explicit period.
    const rawPeriod = event.payload.period;
    const period = typeof rawPeriod === "string" && PERIOD_PATTERN.test(rawPeriod) ? rawPeriod : currentPeriod();
    return { entityId: event.tenantId, raw: { period } };
  },

  async extract(observed, ctx): Promise<Ai21Extracted> {
    const [balanceSheet, incomeStatement] = await Promise.all([
      annotateStatement(ctx.tenantId, observed.raw.period, "balance_sheet"),
      annotateStatement(ctx.tenantId, observed.raw.period, "income_statement"),
    ]);
    return { period: observed.raw.period, balanceSheet, incomeStatement };
  },

  async reason(extracted): Promise<ReasonResult<Ai21Proposal>> {
    const findings: ReasonResult<Ai21Proposal>["findings"] = [];
    const reasonChain = [
      `balance sheet: ${extracted.balanceSheet.unsupportedMaterialCount} unsupported material line(s), balanced=${extracted.balanceSheet.balanceCheck?.balanced}`,
      `income statement: ${extracted.incomeStatement.unsupportedMaterialCount} unsupported material line(s)`,
    ];

    for (const statement of [extracted.balanceSheet, extracted.incomeStatement]) {
      for (const group of Object.values(statement.groups)) {
        for (const line of group.lines) {
          if (!line.unsupportedMaterial) continue;
          findings.push({
            id: `ai21-unsupported-${statement.statementType}-${line.accountId}-${extracted.period}`,
            type: AI_FINDING_TYPE.EXCEPTION,
            severity: AI_FINDING_SEVERITY.HIGH,
            title: `Unsupported material line: ${line.name}`,
            detail: `${statement.statementType.replace(/_/g, " ")} — amount ${line.amount}, reconciliation status: ${line.reconciliationStatus}`,
            amount: line.amount,
            confidence: 1,
            subjectRefs: [{ model: "Account", id: line.accountId }],
            evidence: [],
            reasonChain: [],
          });
        }
      }
    }

    if (extracted.balanceSheet.balanceCheck && !extracted.balanceSheet.balanceCheck.balanced) {
      findings.push({
        id: `ai21-balance-sheet-imbalance-${extracted.period}`,
        type: AI_FINDING_TYPE.ANOMALY,
        severity: AI_FINDING_SEVERITY.CRITICAL,
        title: "Balance sheet does not balance",
        detail: `assets ${extracted.balanceSheet.balanceCheck.assetTotal} vs liabilities+equity ${extracted.balanceSheet.balanceCheck.liabilityPlusEquityTotal}`,
        confidence: 1,
        subjectRefs: [],
        evidence: [],
        reasonChain: [],
      });
    }

    return {
      proposal: { period: extracted.period, balanceSheet: extracted.balanceSheet, incomeStatement: extracted.incomeStatement },
      confidence: 1,
      findings,
      reasonChain,
    };
  },

  async validate(): Promise<{ valid: boolean; vetoReason?: string }> {
    return { valid: true };
  },

  async act(): Promise<ActResult> {
    return { findings: [], actionsTaken: [] }; // OBSERVE only — annotation, never a write
  },

  async verify(): Promise<VerifyResult> {
    return { ok: true };
  },
};

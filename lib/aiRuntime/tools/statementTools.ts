import { buildPostedJournalReport } from "@/lib/accounting/reports";
import { annotateStatement, drillIntoAccount, type StatementType } from "@/lib/aiRuntime/statements/annotateStatement";
import { monthBounds } from "@/lib/aiRuntime/tax/rebuildTaxProjection";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-21's tools (docs/ai/BRIEF-06-BATCH-E.md A.4). Both read-only — `get_statement` renders
 * exactly what `lib/accounting/reports.ts::buildPostedJournalReport()` already computes (no
 * second figure), `run_statement_annotation` layers AI-21's own annotation over it. Neither ever
 * writes anything — asserted directly in tests (no ledger-value write path exists in this
 * workflow's folder, same source-grep pattern as AI-09/AI-13).
 */

export interface GetStatementArgs {
  tenantId: string;
  period: string;
  statementType: StatementType;
}
async function getStatementHandler(args: GetStatementArgs) {
  const { start, end } = monthBounds(args.period);
  const report =
    args.statementType === "balance_sheet"
      ? await buildPostedJournalReport({ tenantId: args.tenantId, endDate: end })
      : await buildPostedJournalReport({ tenantId: args.tenantId, startDate: start, endDate: end });
  return { report };
}

export interface RunStatementAnnotationArgs {
  tenantId: string;
  period: string;
  statementType: StatementType;
}
async function runStatementAnnotationHandler(args: RunStatementAnnotationArgs) {
  return annotateStatement(args.tenantId, args.period, args.statementType);
}

export interface DrillIntoAccountArgs {
  tenantId: string;
  accountId: string;
  period: string;
}
async function drillIntoAccountHandler(args: DrillIntoAccountArgs) {
  return drillIntoAccount(args.tenantId, args.accountId, args.period);
}

export function registerStatementTools(): void {
  registerTool<GetStatementArgs>({
    name: "get_statement",
    description: "Reads lib/accounting/reports.ts::buildPostedJournalReport() for a period — the same figures /finance/reports itself renders, never a second computation.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getStatementHandler,
  });

  registerTool<RunStatementAnnotationArgs>({
    name: "run_statement_annotation",
    description: "Annotates a statement's lines with materiality/movement/reconciliation/evidence/staleness — lib/aiRuntime/statements/annotateStatement.ts, never recomputes a figure.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: runStatementAnnotationHandler,
  });

  registerTool<DrillIntoAccountArgs>({
    name: "drill_into_account",
    description: "The line→account→journals→transactions→source-documents drill chain for one account — wraps AI-14's own getAccountTransactionDetail(), the shared service AI-18 (Chunk 7) also consumes.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: drillIntoAccountHandler,
  });
}

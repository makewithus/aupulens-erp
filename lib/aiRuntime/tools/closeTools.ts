import connectDB from "@/lib/db";
import PeriodClosing from "@/models/finance/PeriodClosing";
import FxRate from "@/models/finance/FxRate";
import Payroll from "@/models/hr/Payroll";
import StockMove from "@/models/inventory/StockMove";
import AiCloseAssertion from "@/models/ai/AiCloseAssertion";
import { AI_AUTONOMY_LEVEL, AI_TOOL_SIDE_EFFECT } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";
import { runReconciliationDefinition, RECONCILIATION_DEFINITIONS } from "@/lib/aiRuntime/reconciliation/engine";
import { computeCloseReadiness } from "@/lib/aiRuntime/closeReadiness/compute";
import { evaluateCloseAssertions } from "@/lib/aiRuntime/evidence/assertions";

/**
 * Batch C read + analyse tools (docs/ai/BRIEF-04-BATCH-C.md A.3). `get_period_closing` is
 * structurally read-only: no write method wraps `PeriodClosing` anywhere (Hard Rule 4 / A.2 —
 * AI-13/AI-24 must never mutate it), proven by a source-grep test alongside AI-09's identical
 * Sales-boundary test.
 *
 * `record_close_assertion` is the second deliberate exception to A.3's "no new write tools"
 * (the first is `resolve_task`, `lib/aiRuntime/tools/control.ts`) — found necessary, not assumed,
 * when `tests/ai/aiRuntime/safety.test.ts`'s existing source-grep test caught AI-24 writing
 * `AiCloseAssertion` directly from its own `act()` (a real Hard Rule 2 violation, the exact class
 * of defect that test exists to catch). `AiCloseAssertion` is AI-24's own business-meaningful
 * output, not runtime plumbing like `AiWorkflowRun`/`AiDecisionTrace` — so, consistent with every
 * other workflow-produced record in this codebase, it goes through a registered tool.
 */

export async function getPeriodClosingHandler(args: { tenantId: string; fiscalYear?: number; month?: number }) {
  await connectDB();
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.fiscalYear) query.fiscalYear = args.fiscalYear;
  if (args.month) query.month = args.month;
  return PeriodClosing.find(query).limit(24).lean();
}

export async function getFxRateHandler(args: { tenantId: string; fromCurrency: string; toCurrency: string; asOf: string }) {
  await connectDB();
  return FxRate.findOne({
    tenantId: args.tenantId,
    fromCurrency: args.fromCurrency.toUpperCase(),
    toCurrency: args.toCurrency.toUpperCase(),
    rateDate: { $lte: new Date(args.asOf) },
  })
    .sort({ rateDate: -1 })
    .lean();
}

export async function getStockValuationHandler(args: { tenantId: string }) {
  await connectDB();
  return StockMove.find({ tenantId: args.tenantId }).select("moveType moveStatus valuation lines").limit(500).lean();
}

export async function getPayrollHandler(args: { tenantId: string; status?: string }) {
  await connectDB();
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.status) query.status = args.status;
  return Payroll.find(query).select("payrollCode payrollPeriod totals status salaryExpenseJournalId disbursementJournalId").limit(200).lean();
}

export async function runReconciliationHandler(args: { tenantId: string; definitionId: string; periodEnd: string; period: string }) {
  const definition = RECONCILIATION_DEFINITIONS.find((d) => d.id === args.definitionId);
  if (!definition) throw new Error(`Unknown reconciliation definition "${args.definitionId}"`);
  return runReconciliationDefinition(args.tenantId, definition, new Date(args.periodEnd), args.period);
}

export interface RecordCloseAssertionArgs {
  tenantId: string;
  period: string;
  item: string;
  assertionId: string;
  assertionDescription: string;
  verified: boolean;
  evidence: { kind: "record" | "document" | "calculation"; ref: string; label: string }[];
  missing: string[];
  owner?: string;
  requestTaskId?: string;
}

export async function calculateCloseReadinessHandler(args: { tenantId: string; period: string; periodEnd: string }) {
  return computeCloseReadiness(args.tenantId, args.period, new Date(args.periodEnd));
}

export async function buildEvidencePackHandler(args: { tenantId: string; period: string; periodEnd: string }) {
  return evaluateCloseAssertions(args.tenantId, args.period, new Date(args.periodEnd));
}

export async function recordCloseAssertionHandler(args: RecordCloseAssertionArgs) {
  await connectDB();
  const doc = await AiCloseAssertion.findOneAndUpdate(
    { tenantId: args.tenantId, period: args.period, item: args.item },
    {
      $set: {
        assertionId: args.assertionId,
        assertionDescription: args.assertionDescription,
        verified: args.verified,
        evidence: args.evidence,
        missing: args.missing,
        owner: args.owner,
        ...(args.requestTaskId ? { requestTaskId: args.requestTaskId } : {}),
        evaluatedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  return { assertionId: String(doc._id) };
}

export function registerCloseReadTools(): void {
  registerTool({
    name: "get_period_closing",
    description: "Reads PeriodClosing rows — read-only, structurally enforced (no write tool wraps this model, Hard Rule 4).",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getPeriodClosingHandler,
  });

  registerTool({
    name: "get_fx_rate",
    description: "Reads the most recent manually/import-entered FxRate on or before a date — never invents or writes one.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getFxRateHandler,
  });

  registerTool({
    name: "get_stock_valuation",
    description: "Reads StockMove valuation data for a tenant.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getStockValuationHandler,
  });

  registerTool({
    name: "get_payroll",
    description: "Reads Payroll runs for a tenant.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getPayrollHandler,
  });

  registerTool({
    name: "run_reconciliation",
    description: "Runs one AI-22 reconciliation definition and returns its ReconciliationResult — the same function AI-22 itself calls.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: runReconciliationHandler,
  });

  registerTool({
    name: "calculate_close_readiness",
    description: "Runs AI-13's full readiness recomputation and returns it — the same function AI-13 itself calls, without persisting to AiCloseState.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: calculateCloseReadinessHandler,
  });

  registerTool({
    name: "build_evidence_pack",
    description: "Runs AI-24's full assertion evaluation and returns it — the same function AI-24 itself calls, without persisting to AiCloseAssertion.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: buildEvidencePackHandler,
  });
}

export function registerCloseWriteTools(): void {
  registerTool<RecordCloseAssertionArgs>({
    name: "record_close_assertion",
    description: "Upserts one AiCloseAssertion row per {tenantId, period, item} — AI-24's own machine-verifiable assertion record.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    // internal_state (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — writes only AiCloseAssertion.
    // Approved with this formalisation in the brief itself, confirming Chunk 4's OQ #19 flag.
    category: "internal_state",
    handler: recordCloseAssertionHandler,
  });
}

import connectDB from "@/lib/db";
import AiTaxTransaction, { AI_TAX_DIRECTION } from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import { rebuildTaxProjection } from "@/lib/aiRuntime/tax/rebuildTaxProjection";
import { runReconciliationDefinition, RECONCILIATION_DEFINITIONS } from "@/lib/aiRuntime/reconciliation/engine";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-12's tools (docs/ai/BRIEF-06-BATCH-E.md A.4). `rebuild_tax_projection` is the only write —
 * `internal_state`, writes only `AiTaxTransaction`. `get_compliance_profile` is read-only and
 * always will be: `AiComplianceProfile` is the one `models/ai/**` model no workflow may ever
 * write (A.2) — human-entered only, enforced by there being no write tool for it anywhere in
 * this registry (asserted directly in tests).
 */

// ── get_tax_transactions ────────────────────────────────────────────────────

export interface GetTaxTransactionsArgs {
  tenantId: string;
  period: string;
}
async function getTaxTransactionsHandler(args: GetTaxTransactionsArgs) {
  await connectDB();
  const rows = await AiTaxTransaction.find({ tenantId: args.tenantId, periodKey: args.period }).lean();
  return { transactions: rows };
}

// ── get_compliance_profile ──────────────────────────────────────────────────

export interface GetComplianceProfileArgs {
  tenantId: string;
}
async function getComplianceProfileHandler(args: GetComplianceProfileArgs) {
  await connectDB();
  const profile = await AiComplianceProfile.findOne({ tenantId: args.tenantId }).lean();
  return { profile, configured: Boolean(profile && (profile.registrations.length > 0 || profile.obligations.length > 0 || profile.thresholds.length > 0)) };
}

// ── run_tax_reconciliation ──────────────────────────────────────────────────

export interface RunTaxReconciliationArgs {
  tenantId: string;
  periodEnd: string;
  period: string;
}
async function runTaxReconciliationHandler(args: RunTaxReconciliationArgs) {
  const definition = RECONCILIATION_DEFINITIONS.find((d) => d.id === "tax")!;
  const result = await runReconciliationDefinition(args.tenantId, definition, new Date(args.periodEnd), args.period);
  return { result };
}

// ── build_tax_workpaper ─────────────────────────────────────────────────────
//
// Jurisdiction-agnostic (A.5): the box set here is the universal input/output/net-payable shape
// every GST/VAT-style tax works from, never a jurisdiction-specific filing layout (e.g. India's
// GSTR-3B numbered boxes) — no such per-jurisdiction box-code mapping exists anywhere in this
// codebase, and inventing Indian-specific box numbers would violate A.5's explicit instruction.
// This is the honest, universal figures a real filing-ready mapping would be built FROM in a
// future chunk, not the final filing layout itself — recorded in docs/ai/OPEN_QUESTIONS.md.

export interface BuildTaxWorkpaperArgs {
  tenantId: string;
  period: string;
  returnType: string;
}
async function buildTaxWorkpaperHandler(args: BuildTaxWorkpaperArgs) {
  await connectDB();
  const rows = await AiTaxTransaction.find({ tenantId: args.tenantId, periodKey: args.period }).lean();
  const outputRows = rows.filter((r) => r.direction === AI_TAX_DIRECTION.OUTPUT);
  const inputRows = rows.filter((r) => r.direction === AI_TAX_DIRECTION.INPUT);
  const outputTotal = Math.round(outputRows.reduce((s, r) => s + r.taxAmount, 0) * 100) / 100;
  const inputTotal = Math.round(inputRows.reduce((s, r) => s + r.taxAmount, 0) * 100) / 100;
  const netPayable = Math.round((outputTotal - inputTotal) * 100) / 100;

  const boxes = [
    {
      code: "output_tax",
      label: "Output tax (sales)",
      value: outputTotal,
      supporting_transaction_count: outputRows.length,
      supporting_refs: outputRows.map((r) => String(r._id)),
    },
    {
      code: "input_tax_credit",
      label: "Input tax credit (purchases/expenses)",
      value: inputTotal,
      supporting_transaction_count: inputRows.length,
      supporting_refs: inputRows.map((r) => String(r._id)),
    },
    {
      code: "net_payable",
      label: "Net tax payable (output − input)",
      value: netPayable,
      supporting_transaction_count: rows.length,
      supporting_refs: rows.map((r) => String(r._id)),
    },
  ];

  return { returnType: args.returnType, boxes };
}

// ── rebuild_tax_projection ──────────────────────────────────────────────────

export interface RebuildTaxProjectionArgs {
  tenantId: string;
  period: string;
}
async function rebuildTaxProjectionHandler(args: RebuildTaxProjectionArgs) {
  const result = await rebuildTaxProjection(args.tenantId, args.period);
  return result;
}

// ── registration ─────────────────────────────────────────────────────────────

export function registerTaxReadTools(): void {
  registerTool<GetTaxTransactionsArgs>({
    name: "get_tax_transactions",
    description: "Reads models/ai/AiTaxTransaction.ts for a period — AI-12's own rebuildable projection, never computed here.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getTaxTransactionsHandler,
  });

  registerTool<GetComplianceProfileArgs>({
    name: "get_compliance_profile",
    description: "Reads models/ai/AiComplianceProfile.ts — human-entered, no write tool exists for it anywhere.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getComplianceProfileHandler,
  });

  registerTool<RunTaxReconciliationArgs>({
    name: "run_tax_reconciliation",
    description: "Runs AI-22's 'tax' reconciliation definition (ledger vs projected transactions) — never a second reconciliation engine.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: runTaxReconciliationHandler,
  });

  registerTool<BuildTaxWorkpaperArgs>({
    name: "build_tax_workpaper",
    description: "Builds a jurisdiction-agnostic input/output/net-payable box set with transaction-level support, from models/ai/AiTaxTransaction.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: buildTaxWorkpaperHandler,
  });
}

export function registerTaxWriteTools(): void {
  registerTool<RebuildTaxProjectionArgs>({
    name: "rebuild_tax_projection",
    description: "Rebuilds models/ai/AiTaxTransaction.ts for a period from source documents' own already-computed tax amounts. Never computes a tax figure itself.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: rebuildTaxProjectionHandler,
  });
}

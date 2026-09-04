import mongoose from "mongoose";
import connectDB from "@/lib/db";
import Account from "@/models/finance/Account";
import Asset from "@/models/finance/Asset";
import BankStatement from "@/models/finance/BankStatement";
import TaxRate from "@/models/finance/TaxRate";
import AiSchedule, { AI_SCHEDULE_TYPE } from "@/models/ai/AiSchedule";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import AiDecisionTrace from "@/models/ai/AiDecisionTrace";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { buildPostedJournalReport, getAccountTransactionDetail, type ReportGroup, type AccountTransactionLine } from "@/lib/accounting/reports";
import { runAllReconciliationDefinitions } from "@/lib/aiRuntime/reconciliation/engine";
import { computeCloseReadiness } from "@/lib/aiRuntime/closeReadiness/compute";
import { monthBounds } from "@/lib/aiRuntime/tax/rebuildTaxProjection";

/**
 * AI-21 — Financial statement intelligence (docs/ai/BRIEF-06-BATCH-E.md). An annotation/drill
 * layer over `lib/accounting/reports.ts::buildPostedJournalReport()` — **never recomputes a
 * figure**. Every `amount`/`debit`/`credit` here is exactly what that function already produced;
 * this module only attaches what's already known about each account from elsewhere:
 *
 * - `reconciliationStatus` — AI-22's own `runAllReconciliationDefinitions()` result, matched to
 *   this account via the same account-selection queries each reconciliation definition already
 *   runs internally (`liability_payable`→ap_control, `asset_receivable`→ar_control_finance,
 *   `asset_current`→inventory, `Asset.accounts.assetAccountId`→fixed_assets,
 *   `BankStatement.header.journalId`→bank, `TaxRate.accountId`→tax,
 *   `AiSchedule.creditAccountId`(prepaid)/`.debitAccountId`(deferred_revenue), account-name
 *   regex→suspense_clearing). An account matching none of these is honestly `not_covered` — never
 *   accused of being unreconciled when nothing actually checks it (equity/income/expense accounts,
 *   mostly).
 * - `evidenceStatus`/`stalenessDays` — AI-13's own already-computed `AiCloseState.domains[]`
 *   (`computeCloseReadiness()`, never re-derived) for the domain that owns this account.
 * - `materiality`/`movement` — AI-14's own most recent `AiDecisionTrace.rawProposal.comparisons[]`
 *   for this account (never a second, disagreeing materiality/variance computation). Includes
 *   AI-28's timing classification transitively, since AI-14's own drivers already call
 *   `evaluateCutoff()` (docs/ai/BRIEF-06-BATCH-E.md Part 0.4). `not_available` when AI-14 hasn't
 *   run yet for this tenant/account.
 *
 * **`unsupportedMaterial`** (the headline output) is deliberately narrow: `materiality ===
 * "material"` AND `reconciliationStatus === "unreconciled"` — a real, machine-detected tie-out
 * failure on a line big enough to matter. Never raised for `not_covered` accounts (no real signal
 * behind the accusation) or for immaterial ones (the false-positive guard this batch's tests
 * check for).
 */

export type StatementType = "balance_sheet" | "income_statement";

export interface AnnotatedLine {
  accountId: string;
  code: string;
  name: string;
  internalGroup: ReportGroup;
  amount: number;
  materiality: "material" | "immaterial" | "unclassified" | "not_available";
  movement: { variance: number; unexplainedAmount: number; driverTypes: string[] } | null;
  reconciliationStatus: "reconciled" | "unreconciled" | "not_applicable" | "not_implemented" | "not_covered";
  evidenceStatus: "verified" | "unverified" | "not_checked" | "not_applicable" | "not_covered";
  stalenessDays: number;
  unsupportedMaterial: boolean;
}

export interface AnnotatedGroup {
  total: number;
  lines: AnnotatedLine[];
}

export interface AnnotatedStatement {
  statementType: StatementType;
  period: string;
  groups: Partial<Record<ReportGroup, AnnotatedGroup>>;
  totals: { debit: number; credit: number; balanced: boolean };
  balanceCheck?: { assetTotal: number; liabilityPlusEquityTotal: number; balanced: boolean };
  unsupportedMaterialCount: number;
}

interface AccountCoverage {
  definitionId: string;
  closeDomain: string | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function buildAccountCoverage(tenantId: string): Promise<Map<string, AccountCoverage>> {
  await connectDB();
  const map = new Map<string, AccountCoverage>();

  const apAccounts = await Account.find({ tenantId, account_type: "liability_payable" }).select("_id").lean();
  for (const a of apAccounts) map.set(String(a._id), { definitionId: "ap_control", closeDomain: "ap" });

  const arAccounts = await Account.find({ tenantId, account_type: "asset_receivable" }).select("_id").lean();
  for (const a of arAccounts) map.set(String(a._id), { definitionId: "ar_control_finance", closeDomain: "ar_finance" });

  const inventoryAccounts = await Account.find({ tenantId, account_type: "asset_current" }).select("_id").lean();
  for (const a of inventoryAccounts) if (!map.has(String(a._id))) map.set(String(a._id), { definitionId: "inventory", closeDomain: "inventory" });

  const assetAccountIds: mongoose.Types.ObjectId[] = await Asset.distinct("accounts.assetAccountId", { tenantId, status: DOCUMENT_STATUS.POSTED });
  for (const id of assetAccountIds) map.set(String(id), { definitionId: "fixed_assets", closeDomain: "fixed_assets" });

  const bankAccountIds: unknown[] = await BankStatement.distinct("header.journalId", { tenantId });
  for (const id of bankAccountIds) if (id) map.set(String(id), { definitionId: "bank", closeDomain: "bank" });

  const taxAccountIds: unknown[] = await TaxRate.distinct("accountId", { tenantId, accountId: { $exists: true, $ne: null } });
  for (const id of taxAccountIds) map.set(String(id), { definitionId: "tax", closeDomain: "tax" });

  const prepaidAccountIds: unknown[] = await AiSchedule.distinct("creditAccountId", { tenantId, scheduleType: AI_SCHEDULE_TYPE.PREPAID, status: { $ne: "cancelled" } });
  for (const id of prepaidAccountIds) map.set(String(id), { definitionId: "prepaid", closeDomain: "prepaids" });

  const deferredAccountIds: unknown[] = await AiSchedule.distinct("debitAccountId", { tenantId, scheduleType: AI_SCHEDULE_TYPE.DEFERRED_REVENUE, status: { $ne: "cancelled" } });
  for (const id of deferredAccountIds) map.set(String(id), { definitionId: "deferred_revenue", closeDomain: "revenue" });

  const suspenseAccounts = await Account.find({ tenantId, name: { $regex: /suspense|clearing/i } }).select("_id").lean();
  for (const a of suspenseAccounts) map.set(String(a._id), { definitionId: "suspense_clearing", closeDomain: null });

  return map;
}

async function loadLatestAi14Comparisons(tenantId: string): Promise<Map<string, { materialityVerdict: string; variance: number; unexplainedAmount: number; driverTypes: string[] }>> {
  await connectDB();
  const run = await AiWorkflowRun.findOne({ tenantId, workflowId: "AI-14" }).sort({ createdAt: -1 }).lean();
  if (!run) return new Map();
  const trace = await AiDecisionTrace.findOne({ runId: String(run._id) }).lean();
  const comparisons =
    (trace?.rawProposal as { comparisons?: { accountId: string; materialityVerdict: string; variance: number; unexplainedAmount: number; drivers: { type: string }[] }[] } | undefined)?.comparisons ?? [];
  return new Map(comparisons.map((c) => [c.accountId, { materialityVerdict: c.materialityVerdict, variance: c.variance, unexplainedAmount: c.unexplainedAmount, driverTypes: c.drivers.map((d) => d.type) }]));
}

export async function annotateStatement(tenantId: string, period: string, statementType: StatementType): Promise<AnnotatedStatement> {
  await connectDB();
  const { start: periodStart, end: periodEnd } = monthBounds(period);

  const report =
    statementType === "balance_sheet"
      ? await buildPostedJournalReport({ tenantId, endDate: periodEnd })
      : await buildPostedJournalReport({ tenantId, startDate: periodStart, endDate: periodEnd });

  const groupsToInclude: ReportGroup[] = statementType === "balance_sheet" ? ["asset", "liability", "equity"] : ["income", "expense"];

  const coverage = await buildAccountCoverage(tenantId);
  const reconciliationResults = await runAllReconciliationDefinitions(tenantId, periodEnd, period);
  const reconciliationByDefinition = new Map(reconciliationResults.map((r) => [r.definitionId, r]));
  const closeState = await computeCloseReadiness(tenantId, period, periodEnd);
  const domainByName = new Map(closeState.domains.map((d) => [d.domain, d]));
  const ai14Comparisons = await loadLatestAi14Comparisons(tenantId);

  const groups: Partial<Record<ReportGroup, AnnotatedGroup>> = {};
  let unsupportedMaterialCount = 0;

  for (const groupName of groupsToInclude) {
    const group = report[groupName];
    const lines: AnnotatedLine[] = [];

    for (const acc of Object.values(group.accounts)) {
      const cov = coverage.get(acc.id);
      const reconciliationResult = cov ? reconciliationByDefinition.get(cov.definitionId) : undefined;

      let reconciliationStatus: AnnotatedLine["reconciliationStatus"] = "not_covered";
      if (reconciliationResult) {
        if (reconciliationResult.status === "reconciled") reconciliationStatus = "reconciled";
        else if (reconciliationResult.status === "unreconciled") reconciliationStatus = "unreconciled";
        else if (reconciliationResult.status === "not_applicable") reconciliationStatus = "not_applicable";
        else reconciliationStatus = "not_implemented";
      }

      const domain = cov?.closeDomain ? domainByName.get(cov.closeDomain) : undefined;
      let evidenceStatus: AnnotatedLine["evidenceStatus"] = "not_covered";
      let stalenessDays = 0;
      if (domain) {
        if (domain.status === "ready") evidenceStatus = "verified";
        else if (domain.status === "not_applicable") evidenceStatus = "not_applicable";
        else if (domain.status === "not_checked") evidenceStatus = "not_checked";
        else evidenceStatus = "unverified";
        stalenessDays = domain.blockers.reduce((max, b) => Math.max(max, b.ageDays), 0);
      }

      const ai14 = ai14Comparisons.get(acc.id);
      const materiality: AnnotatedLine["materiality"] = ai14 ? (ai14.materialityVerdict as AnnotatedLine["materiality"]) : "not_available";
      const movement = ai14 ? { variance: ai14.variance, unexplainedAmount: ai14.unexplainedAmount, driverTypes: ai14.driverTypes } : null;

      const unsupportedMaterial = materiality === "material" && reconciliationStatus === "unreconciled";
      if (unsupportedMaterial) unsupportedMaterialCount += 1;

      lines.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        internalGroup: acc.internalGroup,
        amount: acc.amount,
        materiality,
        movement,
        reconciliationStatus,
        evidenceStatus,
        stalenessDays,
        unsupportedMaterial,
      });
    }

    groups[groupName] = { total: group.total, lines };
  }

  const result: AnnotatedStatement = {
    statementType,
    period,
    groups,
    totals: report.totals,
    unsupportedMaterialCount,
  };

  if (statementType === "balance_sheet") {
    const assetTotal = round2(report.asset.total);
    const liabilityPlusEquityTotal = round2(report.liability.total + report.equity.total);
    result.balanceCheck = { assetTotal, liabilityPlusEquityTotal, balanced: Math.abs(assetTotal - liabilityPlusEquityTotal) < 0.01 };
  }

  return result;
}

/**
 * The drill-down chain (line → account → journals → transactions → source documents) — a thin
 * wrapper over `getAccountTransactionDetail()` (AI-14's own export, never a second drill engine)
 * so AI-18 (Chunk 7) has one obvious, named entry point to reuse rather than reaching into AI-14
 * directly.
 */
export async function drillIntoAccount(tenantId: string, accountId: string, period: string): Promise<{ accountId: string; period: string; transactions: AccountTransactionLine[] }> {
  const { start, end } = monthBounds(period);
  const transactions = await getAccountTransactionDetail({ tenantId, accountId, startDate: start, endDate: end });
  return { accountId, period, transactions };
}

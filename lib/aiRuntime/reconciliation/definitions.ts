import mongoose from "mongoose";
import connectDB from "@/lib/db";
import BankStatement from "@/models/finance/BankStatement";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import Asset from "@/models/finance/Asset";
import StockMove from "@/models/inventory/StockMove";
import Payroll from "@/models/hr/Payroll";
import JournalEntry from "@/models/finance/JournalEntry";
import AiSchedule, { AI_SCHEDULE_TYPE } from "@/models/ai/AiSchedule";
import TaxRate from "@/models/finance/TaxRate";
import AiTaxTransaction, { AI_TAX_DIRECTION } from "@/models/ai/AiTaxTransaction";
import { DOCUMENT_STATUS, PAYMENT_STATE, STOCK_MOVE_STATUS, PAYROLL_STATUS } from "@/lib/constants/statuses";
import { computeBankPosition } from "@/lib/aiRuntime/workflows/ai-03-bank-reconciliation/position";
import { computeAssetRegisterToGl } from "@/lib/accounting/registerToGl";
import { resolveMappedAccounts } from "@/lib/aiRuntime/accountMapping/resolve";
import { getCapability } from "@/lib/aiRuntime/capabilities/registry";
import type { ReconciliationDefinition, ReconciliationResult, ReconciliationDifference } from "@/lib/aiRuntime/reconciliation/types";

/**
 * AI-22's nine registered reconciliation definitions plus three explicitly `not_implemented`
 * (docs/ai/BRIEF-04-BATCH-C.md, AI-22). "One engine, many definitions": `bank` and `fixed_assets`
 * wrap AI-03's and AI-10's existing functions verbatim (never reimplemented); the rest compute a
 * real left/right total from data that exists, and classify any gap.
 *
 * **Scope simplifications, recorded honestly** (docs/ai/OPEN_QUESTIONS.md has the full write-up):
 * - `ap_control`/`ar_control_finance` compare *current* open balances, not a point-in-time
 *   history replay — `Invoice` carries no ledger of `amountResidual` over time to reconstruct
 *   "as of periodEnd" precisely.
 * - `inventory`'s GL side uses the `asset_current` account-type bucket — no dedicated
 *   `asset_inventory` account type exists anywhere in this codebase's Chart of Accounts.
 * - `suspense_clearing` matches accounts by name (`/suspense|clearing/i`) — no dedicated
 *   account_type exists for this either; `not_applicable` when none are found, never invented.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Exported additively (Chunk 8a) for AI-25's DIO computation to reuse — the same balance query,
 *  never a second implementation. `asOfDate`, when given, restricts to entries dated on or before
 *  it (a point-in-time balance, matching how `buildAgedPartnerReport` computes AR/AP); omitted,
 *  behaviour is unchanged from every existing caller (the account's current all-time balance). */
export async function glBalanceForAccount(tenantId: string, accountId: mongoose.Types.ObjectId | string, asOfDate?: Date): Promise<number> {
  const rows = await JournalEntry.aggregate([
    { $match: { tenantId, status: DOCUMENT_STATUS.POSTED, ...(asOfDate ? { "header.date": { $lte: asOfDate } } : {}) } },
    { $unwind: "$lineIds" },
    { $match: { "lineIds.accountId": new mongoose.Types.ObjectId(accountId) } },
    { $group: { _id: null, debit: { $sum: "$lineIds.debit" }, credit: { $sum: "$lineIds.credit" } } },
  ]);
  return rows[0] ? round2(rows[0].debit - rows[0].credit) : 0;
}

function unexplainedDifference(amount: number, cause: string): ReconciliationDifference[] {
  if (Math.abs(amount) < 0.01) return [];
  return [{ type: "unexplained", amount: round2(amount), ageDays: 0, cause, owner: undefined, evidence: [] }];
}

// ── bank ──────────────────────────────────────────────────────────────────

const bankDefinition: ReconciliationDefinition = {
  id: "bank",
  name: "Bank vs GL",
  owner: "finance",
  defaultTolerance: 0.01,
  async run(tenantId) {
    await connectDB();
    const statements = await BankStatement.find({ tenantId }).select("_id").lean();
    let leftTotal = 0;
    let rightTotal = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;
    let oldestOpenItemDays = 0;
    const differences: ReconciliationDifference[] = [];

    for (const s of statements) {
      const position = await computeBankPosition(tenantId, String(s._id));
      if (!position) continue;
      leftTotal += position.bankBalance;
      rightTotal += position.glBalance;
      unmatchedCount += position.unmatchedCount;
      oldestOpenItemDays = Math.max(oldestOpenItemDays, position.oldestUnmatchedDays);
      if (Math.abs(position.difference) > 0.01) {
        differences.push({
          type: position.unmatchedCount > 0 ? "timing" : "unexplained",
          amount: position.difference,
          ageDays: position.oldestUnmatchedDays,
          cause: position.unmatchedCount > 0 ? `${position.unmatchedCount} unmatched bank line(s)` : "balance mismatch with no unmatched lines to explain it",
          owner: "finance",
          evidence: [{ kind: "record", ref: position.bankStatementId, label: "BankStatement" }],
        });
      }
    }

    return {
      leftTotal: round2(leftTotal),
      rightTotal: round2(rightTotal),
      difference: round2(leftTotal - rightTotal),
      matchedCount,
      unmatchedLeft: [],
      unmatchedRight: [],
      differences,
      oldestOpenItemDays,
      status: "reconciled", // placeholder — overwritten by classifyReconciliationStatus in the engine
    };
  },
};

// ── ap_control / ar_control_finance ─────────────────────────────────────────

function apArDefinition(id: "ap_control" | "ar_control_finance", moveType: "in_invoice" | "out_invoice", controlAccountType: string): ReconciliationDefinition {
  return {
    id,
    name: id === "ap_control" ? "AP subledger vs payable control" : "AR (Finance) subledger vs receivable control",
    owner: "finance",
    defaultTolerance: 0.01,
    async run(tenantId) {
      await connectDB();
      const openInvoices = await Invoice.find({
        tenantId,
        moveType,
        paymentState: { $nin: [PAYMENT_STATE.PAID] },
        state: { $ne: DOCUMENT_STATUS.CANCELLED },
      })
        .select("amountResidual name invoiceDate")
        .lean();
      const leftTotal = round2(openInvoices.reduce((s, i) => s + ((i as { amountResidual?: number }).amountResidual ?? 0), 0));

      const controlAccount = await Account.findOne({ tenantId, account_type: controlAccountType, isActive: { $ne: false } }).lean();
      if (!controlAccount) {
        // 0.3 (docs/ai/BRIEF-07-BATCH-F.md) — not_applicable is only valid when the population
        // (open invoices) is empty too. Open invoices with nowhere to reconcile them is a real
        // blocker, not an absence of a question.
        if (openInvoices.length === 0) {
          return { leftTotal: 0, rightTotal: 0, difference: 0, matchedCount: 0, unmatchedLeft: [], unmatchedRight: [], differences: [], oldestOpenItemDays: 0, status: "not_applicable" };
        }
        return {
          leftTotal,
          rightTotal: 0,
          difference: leftTotal,
          matchedCount: openInvoices.length,
          unmatchedLeft: [],
          unmatchedRight: [],
          differences: unexplainedDifference(leftTotal, `no ${controlAccountType} control account configured (configuration_missing) — ${openInvoices.length} open item(s) exist with nowhere to reconcile them`),
          oldestOpenItemDays: 0,
          status: "reconciled", // placeholder — overwritten by classifyReconciliationStatus in the engine
        };
      }
      const rightTotal = await glBalanceForAccount(tenantId, controlAccount._id);
      const difference = round2(id === "ap_control" ? rightTotal - leftTotal : leftTotal - rightTotal);
      const oldest = openInvoices.reduce((min, i) => Math.min(min, new Date((i as { invoiceDate?: Date }).invoiceDate ?? Date.now()).getTime()), Date.now());
      const oldestOpenItemDays = openInvoices.length > 0 ? Math.floor((Date.now() - oldest) / (24 * 60 * 60 * 1000)) : 0;

      return {
        leftTotal,
        rightTotal,
        difference,
        matchedCount: openInvoices.length,
        unmatchedLeft: [],
        unmatchedRight: [],
        differences: unexplainedDifference(difference, `${id} subledger total does not tie to the control account balance`),
        oldestOpenItemDays,
        status: "reconciled",
      };
    },
  };
}

// ── fixed_assets ─────────────────────────────────────────────────────────────

const fixedAssetsDefinition: ReconciliationDefinition = {
  id: "fixed_assets",
  name: "Fixed asset register vs GL",
  owner: "finance",
  defaultTolerance: 0.01,
  async run(tenantId) {
    await connectDB();
    const assetAccountIds: mongoose.Types.ObjectId[] = await Asset.distinct("accounts.assetAccountId", { tenantId, status: DOCUMENT_STATUS.POSTED });
    let leftTotal = 0;
    let rightTotal = 0;
    const differences: ReconciliationDifference[] = [];

    for (const accountId of assetAccountIds) {
      const tieOut = await computeAssetRegisterToGl(tenantId, String(accountId));
      leftTotal += tieOut.registerNbv;
      rightTotal += tieOut.glBalance;
      if (Math.abs(tieOut.difference) > 0.01) {
        differences.push(...unexplainedDifference(tieOut.difference, `register vs GL mismatch on asset account ${accountId}`));
      }
    }

    return {
      leftTotal: round2(leftTotal),
      rightTotal: round2(rightTotal),
      difference: round2(leftTotal - rightTotal),
      matchedCount: assetAccountIds.length,
      unmatchedLeft: [],
      unmatchedRight: [],
      differences,
      oldestOpenItemDays: 0,
      status: "reconciled",
    };
  },
};

// ── inventory ─────────────────────────────────────────────────────────────

const inventoryDefinition: ReconciliationDefinition = {
  id: "inventory",
  name: "Inventory valuation vs GL",
  owner: "inventory",
  defaultTolerance: 0.01,
  async run(tenantId) {
    await connectDB();
    const moves = await StockMove.find({
      tenantId,
      moveStatus: { $nin: [STOCK_MOVE_STATUS.CANCELLED, STOCK_MOVE_STATUS.REQUESTED, STOCK_MOVE_STATUS.SOURCE_VALIDATED, STOCK_MOVE_STATUS.DESTINATION_ASSIGNED] },
    })
      .select("moveType valuation")
      .lean();
    const leftTotal = round2(
      moves.reduce((s, m) => {
        const value = (m as { valuation?: { totalValue?: number } }).valuation?.totalValue ?? 0;
        const sign = (m as { moveType?: string }).moveType === "outgoing" ? -1 : 1;
        return s + sign * value;
      }, 0),
    );

    const inventoryAccount = await Account.findOne({ tenantId, account_type: "asset_current", isActive: { $ne: false } }).lean();
    if (!inventoryAccount) {
      // 0.3 (docs/ai/BRIEF-07-BATCH-F.md) — not_applicable only when the population (real stock
      // moves) is empty too. Real stock activity with no inventory GL account to reconcile it
      // against is a blocker, not an absence of a question.
      if (moves.length === 0) {
        return { leftTotal: 0, rightTotal: 0, difference: 0, matchedCount: moves.length, unmatchedLeft: [], unmatchedRight: [], differences: [], oldestOpenItemDays: 0, status: "not_applicable" };
      }
      return {
        leftTotal,
        rightTotal: 0,
        difference: leftTotal,
        matchedCount: moves.length,
        unmatchedLeft: [],
        unmatchedRight: [],
        differences: unexplainedDifference(leftTotal, "no inventory GL account configured (asset_current bucket, configuration_missing) — real stock activity exists with nowhere to reconcile it"),
        oldestOpenItemDays: 0,
        status: "reconciled", // placeholder — overwritten by classifyReconciliationStatus in the engine
      };
    }
    const rightTotal = await glBalanceForAccount(tenantId, inventoryAccount._id);
    const difference = round2(leftTotal - rightTotal);

    return {
      leftTotal,
      rightTotal,
      difference,
      matchedCount: moves.length,
      unmatchedLeft: [],
      unmatchedRight: [],
      differences: unexplainedDifference(difference, "inventory valuation total does not tie to the GL balance"),
      oldestOpenItemDays: 0,
      status: "reconciled",
    };
  },
};

// ── payroll ─────────────────────────────────────────────────────────────────

const payrollDefinition: ReconciliationDefinition = {
  id: "payroll",
  name: "Payroll runs vs posted journals",
  owner: "hr",
  defaultTolerance: 0.01,
  async run(tenantId) {
    await connectDB();
    const runs = await Payroll.find({ tenantId, status: { $ne: PAYROLL_STATUS.DRAFT } })
      .select("totals salaryExpenseJournalId disbursementJournalId payrollCode")
      .lean();
    // 0.3 (docs/ai/BRIEF-07-BATCH-F.md) — genuinely empty population (no non-draft payroll runs
    // at all) is not_applicable, never a vacuous "reconciled" (0 ties to 0 tells nobody anything).
    if (runs.length === 0) {
      return { leftTotal: 0, rightTotal: 0, difference: 0, matchedCount: 0, unmatchedLeft: [], unmatchedRight: [], differences: [], oldestOpenItemDays: 0, status: "not_applicable" };
    }
    let leftTotal = 0;
    let rightTotal = 0;
    const differences: ReconciliationDifference[] = [];
    const unmatchedLeft: { ref: string; amount: number }[] = [];

    for (const run of runs) {
      const totalNet = (run as { totals?: { totalNet?: number } }).totals?.totalNet ?? 0;
      leftTotal += totalNet;
      const salaryJournalId = (run as { salaryExpenseJournalId?: mongoose.Types.ObjectId }).salaryExpenseJournalId;
      const disbursementJournalId = (run as { disbursementJournalId?: mongoose.Types.ObjectId }).disbursementJournalId;
      if (!salaryJournalId && !disbursementJournalId) {
        unmatchedLeft.push({ ref: (run as { payrollCode?: string }).payrollCode ?? String(run._id), amount: totalNet });
        differences.push({ type: "missing_right", amount: totalNet, ageDays: 0, cause: "payroll run has no linked journal entry", owner: "hr", evidence: [{ kind: "record", ref: String(run._id), label: "Payroll" }] });
        continue;
      }
      const journalId = disbursementJournalId ?? salaryJournalId!;
      const entry = await JournalEntry.findById(journalId).select("lineIds status").lean();
      if (entry && entry.status === DOCUMENT_STATUS.POSTED) {
        const entryTotal = round2((entry.lineIds ?? []).reduce((s: number, l: { debit?: number }) => s + (l.debit ?? 0), 0));
        rightTotal += entryTotal;
      }
    }

    return {
      leftTotal: round2(leftTotal),
      rightTotal: round2(rightTotal),
      difference: round2(leftTotal - rightTotal),
      matchedCount: runs.length - unmatchedLeft.length,
      unmatchedLeft,
      unmatchedRight: [],
      differences,
      oldestOpenItemDays: 0,
      status: "reconciled",
    };
  },
};

// ── prepaid / deferred_revenue (AiSchedule remaining vs GL) ─────────────────

function scheduleDefinition(id: "prepaid" | "deferred_revenue", scheduleType: string): ReconciliationDefinition {
  return {
    id,
    name: id === "prepaid" ? "Prepaid schedules vs GL" : "Deferred revenue schedules vs GL",
    owner: "finance",
    defaultTolerance: 0.01,
    async run(tenantId) {
      await connectDB();
      const schedules = await AiSchedule.find({ tenantId, scheduleType, status: { $ne: "cancelled" } })
        .select("remaining creditAccountId debitAccountId scheduleType")
        .lean();
      const leftTotal = round2(schedules.reduce((s, sc) => s + (sc.remaining ?? 0), 0));

      // The balance-sheet account is whichever leg is the asset/liability being drawn down —
      // prepaid schedules debit expense/credit the prepaid asset; deferred_revenue schedules
      // debit the deferred-revenue liability/credit revenue. So: prepaid's GL side is
      // creditAccountId, deferred_revenue's is debitAccountId.
      const accountIds = Array.from(new Set(schedules.map((sc) => String(id === "prepaid" ? sc.creditAccountId : sc.debitAccountId))));
      let rightTotal = 0;
      for (const accountId of accountIds) {
        rightTotal += await glBalanceForAccount(tenantId, accountId);
      }
      rightTotal = round2(id === "prepaid" ? rightTotal : -rightTotal); // liability balances are credit-normal
      const difference = round2(leftTotal - rightTotal);

      return {
        leftTotal,
        rightTotal,
        difference,
        matchedCount: schedules.length,
        unmatchedLeft: [],
        unmatchedRight: [],
        differences: unexplainedDifference(difference, `${id} schedule remaining balance does not tie to the GL account(s)`),
        oldestOpenItemDays: 0,
        status: "reconciled",
      };
    },
  };
}

// ── suspense_clearing ────────────────────────────────────────────────────────

const suspenseClearingDefinition: ReconciliationDefinition = {
  id: "suspense_clearing",
  name: "Suspense / clearing accounts",
  owner: "finance",
  defaultTolerance: 0.01,
  async run(tenantId) {
    await connectDB();
    // Chunk 8b (0.2): the name regex below is a latent false-completion path for any tenant whose
    // suspense/clearing accounts don't happen to be named that way — resolveMappedAccounts()
    // checks models/ai/AiAccountMapping.ts (role "suspense_clearing") first; the regex is now only
    // the fallback when nothing is explicitly configured.
    const mapping = await resolveMappedAccounts(tenantId, "suspense_clearing", async () => {
      const found = await Account.find({ tenantId, name: { $regex: /suspense|clearing/i } }).select("_id code name").lean();
      return { resolved: found.length > 0, accounts: found.map((a) => ({ id: String(a._id), code: a.code, name: a.name })), basis: found.length > 0 ? `${found.length} account(s) matched the "suspense|clearing" name pattern` : "no account name matches the suspense/clearing pattern" };
    });
    const accounts = mapping.accounts;
    if (accounts.length === 0) {
      return {
        leftTotal: 0,
        rightTotal: 0,
        difference: 0,
        matchedCount: 0,
        unmatchedLeft: [],
        unmatchedRight: [],
        differences: [],
        oldestOpenItemDays: 0,
        status: "not_applicable",
      };
    }
    let total = 0;
    const differences: ReconciliationDifference[] = [];
    for (const acc of accounts) {
      const balance = await glBalanceForAccount(tenantId, acc.id);
      total += balance;
      if (Math.abs(balance) > 0.01) {
        differences.push({
          type: "unexplained",
          amount: round2(balance),
          ageDays: 0,
          cause: `suspense/clearing account "${acc.name}" carries a non-zero balance — target is always zero`,
          owner: "finance",
          evidence: [{ kind: "record", ref: acc.id, label: acc.name }],
        });
      }
    }
    return {
      leftTotal: round2(total),
      rightTotal: 0,
      difference: round2(total),
      matchedCount: accounts.length,
      unmatchedLeft: [],
      unmatchedRight: [],
      differences,
      oldestOpenItemDays: 0,
      status: "reconciled",
    };
  },
};

// ── tax ──────────────────────────────────────────────────────────────────────
// docs/ai/BRIEF-06-BATCH-E.md, AI-12 A.1 — the "ledger vs transactions" two-way leg of AI-12's
// fuller three-way (ledger/transactions/return) reconciliation. Reads AiTaxTransaction (AI-12's
// own rebuildable projection — never computed here) and every distinct TaxRate.accountId as the
// tax control account(s). Sign convention: debit-normal, matching glBalanceForAccount's own
// debit-credit — input tax (an asset/debit) is added, output tax (a liability/credit) is
// subtracted, so a net-payable position and a net-receivable position are both expressed on the
// same axis as the GL balance.

const taxDefinition: ReconciliationDefinition = {
  id: "tax",
  name: "Tax ledger vs projected transactions",
  owner: "finance",
  defaultTolerance: 0.01,
  async run(tenantId, periodEnd) {
    await connectDB();
    const periodKey = `${periodEnd.getUTCFullYear()}-${String(periodEnd.getUTCMonth() + 1).padStart(2, "0")}`;

    const taxRates = await TaxRate.find({ tenantId, accountId: { $exists: true, $ne: null } }).select("accountId").lean();
    const accountIds = Array.from(new Set(taxRates.map((r) => String((r as { accountId?: unknown }).accountId))));

    const rows = await AiTaxTransaction.find({ tenantId, periodKey }).select("direction taxAmount").lean();
    const leftTotal = round2(
      rows.reduce((s, r) => s + (r.direction === AI_TAX_DIRECTION.INPUT ? r.taxAmount : -r.taxAmount), 0),
    );

    if (accountIds.length === 0) {
      // 0.3 (docs/ai/BRIEF-07-BATCH-F.md) — `not_applicable` is only valid when the underlying
      // population is empty. No TaxRate.accountId configured is genuinely not_applicable ONLY
      // when there is also no real tax activity to check (rows.length === 0). Real tax
      // transactions with nowhere to reconcile them is a blocker, not an absence of a question —
      // classified "unreconciled" here so AI-13's blockerFromReconciliation() turns it into a
      // hard blocker (differences[].type === "unexplained"), never a silently-skipped domain.
      if (rows.length === 0) {
        return {
          leftTotal: 0,
          rightTotal: 0,
          difference: 0,
          matchedCount: 0,
          unmatchedLeft: [],
          unmatchedRight: [],
          differences: [],
          oldestOpenItemDays: 0,
          status: "not_applicable",
        };
      }
      return {
        leftTotal,
        rightTotal: 0,
        difference: leftTotal,
        matchedCount: rows.length,
        unmatchedLeft: [],
        unmatchedRight: [],
        differences: unexplainedDifference(leftTotal, "no TaxRate.accountId configured (configuration_missing) — real tax activity exists this period with no control account to reconcile it against"),
        oldestOpenItemDays: 0,
        status: "reconciled", // placeholder — overwritten by classifyReconciliationStatus in the engine
      };
    }

    let rightTotal = 0; // GL ledger side
    for (const accId of accountIds) rightTotal += await glBalanceForAccount(tenantId, accId);
    rightTotal = round2(rightTotal);

    const difference = round2(leftTotal - rightTotal);
    return {
      leftTotal,
      rightTotal,
      difference,
      matchedCount: rows.length,
      unmatchedLeft: [],
      unmatchedRight: [],
      differences: unexplainedDifference(difference, "projected tax transactions do not tie to the tax control account balance"),
      oldestOpenItemDays: 0,
      status: "reconciled",
    };
  },
};

// ── not_implemented ──────────────────────────────────────────────────────────
// Chunk 9 (0.2): the reason text is read live from the shared capability registry
// (lib/aiRuntime/capabilities/registry.ts) — this helper no longer takes its own copy of the
// text, so the registry is the actual single source of truth, not just a matching duplicate.

function notImplemented(id: string, name: string): ReconciliationDefinition {
  const capability = getCapability(id);
  return { id, name, owner: "unassigned", defaultTolerance: 0, run: null, notImplementedReason: capability?.reason ?? `no capability-registry entry for "${id}"` };
}

export const RECONCILIATION_DEFINITIONS: ReconciliationDefinition[] = [
  bankDefinition,
  apArDefinition("ap_control", "in_invoice", "liability_payable"),
  apArDefinition("ar_control_finance", "out_invoice", "asset_receivable"),
  fixedAssetsDefinition,
  inventoryDefinition,
  payrollDefinition,
  scheduleDefinition("prepaid", AI_SCHEDULE_TYPE.PREPAID),
  scheduleDefinition("deferred_revenue", AI_SCHEDULE_TYPE.DEFERRED_REVENUE),
  suspenseClearingDefinition,
  taxDefinition,
  notImplemented("intercompany", "Intercompany reconciliation"),
  notImplemented("processor_settlement", "Payment processor settlement"),
];

export type { ReconciliationDefinition, ReconciliationResult };

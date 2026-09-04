import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Invoice from "@/models/finance/Invoice";
import Vendor from "@/models/admin/Vendor";
import JournalEntry from "@/models/finance/JournalEntry";
import BankStatement from "@/models/finance/BankStatement";
import TransactionLock from "@/models/finance/TransactionLock";
import PeriodClosing from "@/models/finance/PeriodClosing";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import Account from "@/models/finance/Account";
import { AI_AUTONOMY_LEVEL, AI_TOOL_SIDE_EFFECT, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";
import { findDuplicates } from "@/lib/docIntel/duplicateCheck";
import { loadExistingBills } from "@/lib/docIntel/billCreate";

/**
 * Batch A Read + Analyse tools (docs/ai/BRIEF-02-BATCH-A.md Part C). Every handler wraps a
 * real, existing query/model — none of these introduce new business logic, only tenant-scoped
 * read access through the permissioned tool layer.
 */

// ── Read ──────────────────────────────────────────────────────────────────

export interface GetInvoiceArgs {
  tenantId: string;
  invoiceId?: string;
  filter?: { partnerId?: string; moveType?: string; state?: string };
}
export async function getInvoiceHandler(args: GetInvoiceArgs) {
  await connectDB();
  if (args.invoiceId) {
    return Invoice.findOne({ _id: args.invoiceId, tenantId: args.tenantId }).lean();
  }
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.filter?.partnerId) query.partnerId = args.filter.partnerId;
  if (args.filter?.moveType) query.moveType = args.filter.moveType;
  if (args.filter?.state) query.state = args.filter.state;
  return Invoice.find(query).sort({ createdAt: -1 }).limit(200).lean();
}

export interface GetVendorArgs {
  tenantId: string;
  vendorId?: string;
  nameContains?: string;
}
export async function getVendorHandler(args: GetVendorArgs) {
  await connectDB();
  if (args.vendorId) {
    return Vendor.findOne({ _id: args.vendorId, tenantId: args.tenantId }).lean();
  }
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.nameContains) query.name = { $regex: args.nameContains, $options: "i" };
  return Vendor.find(query).limit(50).lean();
}

export interface GetLedgerArgs {
  tenantId: string;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
}
export async function getLedgerHandler(args: GetLedgerArgs) {
  await connectDB();
  const query: Record<string, unknown> = { tenantId: args.tenantId, voucherStatus: "posted" };
  if (args.dateFrom || args.dateTo) {
    query["header.date"] = {
      ...(args.dateFrom ? { $gte: new Date(args.dateFrom) } : {}),
      ...(args.dateTo ? { $lte: new Date(args.dateTo) } : {}),
    };
  }
  const entries = await JournalEntry.find(query).sort({ "header.date": -1 }).limit(500).lean();
  if (!args.accountId) return entries;
  return entries.filter((e) =>
    (e.lineIds ?? []).some((l: { accountId?: mongoose.Types.ObjectId }) => String(l.accountId) === args.accountId),
  );
}

export interface GetJournalArgs {
  tenantId: string;
  journalEntryId: string;
}
export async function getJournalHandler(args: GetJournalArgs) {
  await connectDB();
  return JournalEntry.findOne({ _id: args.journalEntryId, tenantId: args.tenantId }).lean();
}

export interface GetBankTransactionsArgs {
  tenantId: string;
  bankStatementId?: string;
  unreconciledOnly?: boolean;
}
export async function getBankTransactionsHandler(args: GetBankTransactionsArgs) {
  await connectDB();
  if (args.bankStatementId) {
    const stmt = await BankStatement.findOne({ _id: args.bankStatementId, tenantId: args.tenantId }).lean();
    return stmt;
  }
  const statements = await BankStatement.find({ tenantId: args.tenantId }).sort({ createdAt: -1 }).limit(200).lean();
  if (!args.unreconciledOnly) return statements;
  return statements
    .map((s) => ({ ...s, lineIds: (s.lineIds ?? []).filter((l: { isReconciled?: boolean }) => !l.isReconciled) }))
    .filter((s) => s.lineIds.length > 0);
}

export interface GetPeriodStatusArgs {
  tenantId: string;
  module?: string;
}
export async function getPeriodStatusHandler(args: GetPeriodStatusArgs) {
  await connectDB();
  const lockQuery: Record<string, unknown> = { tenantId: args.tenantId, isLocked: true };
  if (args.module) lockQuery.module = { $in: [args.module, "all"] };
  const [locks, closings] = await Promise.all([
    TransactionLock.find(lockQuery).lean(),
    PeriodClosing.find({ tenantId: args.tenantId }).sort({ fiscalYear: -1, month: -1 }).limit(3).lean(),
  ]);
  return { locks, recentClosings: closings };
}

export interface GetSourceDocumentArgs {
  tenantId: string;
  extractedDocumentId: string;
}
export async function getSourceDocumentHandler(args: GetSourceDocumentArgs) {
  await connectDB();
  // ExtractedDocument deliberately never stores original file bytes (see its own doc
  // comment) — there is no Cloudinary URL to return either; the document-intelligence
  // upload flow bypasses Cloudinary entirely (raw FormData straight to the extract
  // route). This tool returns extraction metadata only — flagged in OPEN_QUESTIONS.md.
  return ExtractedDocument.findOne({ _id: args.extractedDocumentId, tenantId: args.tenantId }).lean();
}

export interface GetChartOfAccountsArgs {
  tenantId: string;
  excludeControlAccounts?: boolean;
}
const CONTROL_ACCOUNT_TYPES = new Set(["asset_receivable", "liability_payable"]);
const EXCLUDED_INTERNAL_GROUPS = new Set(["equity", "off_balance"]);

export async function getChartOfAccountsHandler(args: GetChartOfAccountsArgs) {
  await connectDB();
  const query: Record<string, unknown> = {
    tenantId: args.tenantId,
    isActive: { $ne: false },
    isLocked: { $ne: true },
  };
  const accounts = await Account.find(query).lean();
  if (!args.excludeControlAccounts) return accounts;
  // No dedicated "control"/"suspense" flag exists on Account (see docs/ai/SYSTEM_INVENTORY.md) —
  // this is a code-side heuristic: exclude receivable/payable control account_types, equity
  // and off-balance internal_groups, and name-matched suspense accounts.
  return accounts.filter((a) => {
    const type = (a as { account_type?: string }).account_type;
    const group = (a as { internal_group?: string }).internal_group;
    const name = ((a as { name?: string }).name ?? "").toLowerCase();
    if (type && CONTROL_ACCOUNT_TYPES.has(type)) return false;
    if (group && EXCLUDED_INTERNAL_GROUPS.has(group)) return false;
    if (name.includes("suspense")) return false;
    return true;
  });
}

// ── Analyse ───────────────────────────────────────────────────────────────

export interface RunDuplicateScanArgs {
  tenantId: string;
  candidate: { vendorName?: string; billNumber?: string; totalAmount?: number; fileHash?: string; poReference?: string };
}
export async function runDuplicateScanHandler(args: RunDuplicateScanArgs) {
  await connectDB();
  const existingBills = await loadExistingBills(args.tenantId);
  const baseMatches = findDuplicates(
    {
      vendorName: args.candidate.vendorName ?? "",
      billNumber: args.candidate.billNumber ?? "",
      totalAmount: args.candidate.totalAmount ?? 0,
    },
    existingBills,
  );

  const extraMatches: { id: string; reason: string }[] = [];
  if (args.candidate.fileHash) {
    const hashMatches = await ExtractedDocument.find({
      tenantId: args.tenantId,
      fileHash: args.candidate.fileHash,
    })
      .lean();
    for (const doc of hashMatches) {
      if (doc.createdRecordId) {
        extraMatches.push({ id: String(doc.createdRecordId), reason: "identical file hash" });
      }
    }
  }
  if (args.candidate.poReference) {
    const poMatches = await Invoice.find({
      tenantId: args.tenantId,
      poReference: args.candidate.poReference,
      moveType: "in_invoice",
    })
      .lean();
    for (const inv of poMatches) {
      extraMatches.push({ id: String(inv._id), reason: `same PO reference "${args.candidate.poReference}"` });
    }
  }

  const seen = new Set<string>();
  const merged = [...baseMatches, ...extraMatches].filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
  return { matches: merged, isDuplicate: merged.length > 0 };
}

export function registerFinanceReadTools(): void {
  registerTool({
    name: "get_invoice",
    description: "Reads Finance Invoice(s) (moveType in/out_invoice/refund), tenant-scoped.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getInvoiceHandler,
  });

  registerTool({
    name: "get_vendor",
    description: "Reads the Admin Vendor directory (models/admin/Vendor.ts), tenant-scoped.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getVendorHandler,
  });

  registerTool({
    name: "get_ledger",
    description: "Reads posted JournalEntry lines, optionally filtered by account, tenant-scoped.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getLedgerHandler,
  });

  registerTool({
    name: "get_journal",
    description: "Reads one JournalEntry by id, tenant-scoped.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getJournalHandler,
  });

  registerTool({
    name: "get_bank_transactions",
    description: "Reads BankStatement documents/lines, tenant-scoped.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getBankTransactionsHandler,
  });

  registerTool({
    name: "get_period_status",
    description: "Reads TransactionLock + PeriodClosing state for a tenant/module.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getPeriodStatusHandler,
  });

  registerTool({
    name: "get_source_document",
    description: "Reads an ExtractedDocument's stored extraction metadata (no original bytes are stored — see docs/ai/SYSTEM_INVENTORY.md).",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getSourceDocumentHandler,
  });

  registerTool({
    name: "get_chart_of_accounts",
    description: "Reads active, unlocked Account records, optionally excluding control/suspense/equity accounts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getChartOfAccountsHandler,
  });

  registerTool({
    name: "run_duplicate_scan",
    description:
      "Extends lib/docIntel/duplicateCheck.ts with file-hash and PO-reference matching, without changing its existing exact/near-exact behaviour for existing callers.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: runDuplicateScanHandler,
  });
}

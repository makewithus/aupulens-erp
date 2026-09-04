import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Invoice from "@/models/finance/Invoice";
import Expense from "@/models/finance/Expense";
import JournalEntry from "@/models/finance/JournalEntry";
import BankStatement from "@/models/finance/BankStatement";
import BankReconciliation from "@/models/finance/BankReconciliation";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import { AI_AUTONOMY_LEVEL, AI_TOOL_SIDE_EFFECT, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";
import { createDraftBill } from "@/lib/docIntel/billCreate";
import type { VendorBillExtraction } from "@/lib/docIntel/extractionSchemas";
import { buildJournalEntryPayload, type JournalPostingInput } from "@/lib/accounting/posting";
import { journalLinesAreBalanced } from "@/lib/accounting/journal-validation";
import { applySemanticRulesAndClassify } from "@/lib/accounting/smart-rules";
import {
  assertTransactionNotLocked,
  TransactionLockError,
} from "@/lib/accounting/transactionLock";
import { createAttentionItem } from "@/lib/aiRuntime/attention/attentionEngine";

/**
 * Batch A Draft + Execute tools (docs/ai/BRIEF-02-BATCH-A.md Part C). Every write goes
 * through here — never a direct ORM call from workflow code (enforced by
 * tests/ai/aiRuntime/safety.test.ts's source-grep test). Autonomy ceiling for this whole
 * batch is DRAFT on anything ledger-touching (A.5) — nothing here posts a JournalEntry or
 * creates a non-draft Invoice.
 */

export class SmartRulesVetoError extends Error {
  constructor(reason: string) {
    super(`Accounting policy engine vetoed this journal: ${reason}`);
    this.name = "SmartRulesVetoError";
  }
}

export class RecordNotDraftError extends Error {
  constructor(model: string, id: string, status: string) {
    super(`${model} ${id} is not a draft (status: ${status}) — AI-02 may only set the account on a draft record (A.5)`);
    this.name = "RecordNotDraftError";
  }
}

// ── draft_bill ────────────────────────────────────────────────────────────

export interface DraftBillArgs {
  tenantId: string;
  userId: string;
  extraction: VendorBillExtraction;
}

async function draftBillHandler(args: DraftBillArgs) {
  await connectDB();
  return createDraftBill(args.extraction, { tenantId: args.tenantId, userId: args.userId });
}

// ── draft_journal ─────────────────────────────────────────────────────────

export interface DraftJournalArgs {
  tenantId: string;
  createdBy: string;
  header: JournalPostingInput["header"];
  lineIds: JournalPostingInput["lineIds"];
  totals?: JournalPostingInput["totals"];
  /** Set true to convert a smart-rules veto into a non-blocking warning (stamped on the
   *  entry) instead of throwing — used only when the calling workflow has already decided
   *  to escalate regardless, never to silently bypass the engine's objection. */
  allowNonStandard?: boolean;
}

async function draftJournalHandler(args: DraftJournalArgs) {
  await connectDB();

  const body = {
    tenantId: args.tenantId,
    header: args.header,
    lineIds: args.lineIds,
    totals: args.totals,
    status: DOCUMENT_STATUS.DRAFT,
    voucherStatus: "draft",
    allowNonStandard: args.allowNonStandard,
  };

  const classified = await applySemanticRulesAndClassify(body, args.tenantId);
  if (!classified.ok) {
    throw new SmartRulesVetoError(classified.error);
  }

  const balanced = journalLinesAreBalanced(classified.body.lineIds ?? args.lineIds);

  const payload = await buildJournalEntryPayload({
    tenantId: args.tenantId,
    header: classified.body.header,
    lineIds: classified.body.lineIds ?? args.lineIds,
    totals: classified.body.totals,
    status: DOCUMENT_STATUS.DRAFT,
    voucherStatus: "draft",
    voucherType: classified.body.voucherType,
    createdBy: args.createdBy,
  } as JournalPostingInput);

  const entry = await JournalEntry.create(payload);
  return { journalEntryId: String(entry._id), name: entry.header?.name, balanced };
}

// ── set_draft_account ─────────────────────────────────────────────────────

export interface SetDraftAccountArgs {
  tenantId: string;
  recordModel: "Invoice" | "Expense";
  recordId: string;
  lineIndex?: number; // required for Invoice (per-line accountId); ignored for Expense
  accountId: string;
  projectId?: string | null;
}

async function setDraftAccountHandler(args: SetDraftAccountArgs) {
  await connectDB();

  if (args.recordModel === "Invoice") {
    const invoice = await Invoice.findOne({ _id: args.recordId, tenantId: args.tenantId });
    if (!invoice) throw new Error(`Invoice ${args.recordId} not found for tenant ${args.tenantId}`);
    if (invoice.state !== DOCUMENT_STATUS.DRAFT) {
      throw new RecordNotDraftError("Invoice", args.recordId, invoice.state);
    }
    const idx = args.lineIndex ?? 0;
    if (!invoice.invoiceLines[idx]) throw new Error(`Invoice ${args.recordId} has no line at index ${idx}`);
    invoice.invoiceLines[idx].accountId = new mongoose.Types.ObjectId(args.accountId);
    await invoice.save();
    return { recordModel: "Invoice", recordId: args.recordId, lineIndex: idx, accountId: args.accountId };
  }

  const expense = await Expense.findOne({ _id: args.recordId, tenantId: args.tenantId });
  if (!expense) throw new Error(`Expense ${args.recordId} not found for tenant ${args.tenantId}`);
  if (expense.status !== DOCUMENT_STATUS.DRAFT) {
    throw new RecordNotDraftError("Expense", args.recordId, expense.status);
  }
  expense.accountId = new mongoose.Types.ObjectId(args.accountId);
  await expense.save();
  return { recordModel: "Expense", recordId: args.recordId, accountId: args.accountId };
}

// ── reconcile_transaction ────────────────────────────────────────────────

export interface ReconcileTransactionArgs {
  tenantId: string;
  createdBy: string;
  bankStatementId: string;
  lineId: string;
  journalEntryId: string;
  journalLineId: string;
  amount: number;
  date: string | Date;
  description?: string;
}

async function reconcileTransactionHandler(args: ReconcileTransactionArgs) {
  await connectDB();

  const entry = await JournalEntry.findOne({ _id: args.journalEntryId, tenantId: args.tenantId });
  if (!entry) throw new Error(`JournalEntry ${args.journalEntryId} not found`);

  // Real, already-enforced period lock — exactly the same call site as the existing
  // manual reconcile route (app/api/finance/bank/reconcile/route.ts), module "banking".
  try {
    await assertTransactionNotLocked(args.tenantId, "banking", entry.header?.date);
  } catch (err) {
    if (err instanceof TransactionLockError) throw err;
    throw err;
  }

  const statement = await BankStatement.findOne({ _id: args.bankStatementId, tenantId: args.tenantId });
  if (!statement) throw new Error(`BankStatement ${args.bankStatementId} not found`);

  const line = (statement.lineIds as unknown as { _id?: mongoose.Types.ObjectId; isReconciled: boolean }[]).find(
    (l) => String(l._id) === args.lineId,
  );
  if (!line) throw new Error(`BankStatement line ${args.lineId} not found`);
  line.isReconciled = true;
  await statement.save();

  const journalLine = (entry.lineIds as unknown as { _id?: mongoose.Types.ObjectId; reconciled?: boolean }[]).find(
    (l) => String(l._id) === args.journalLineId,
  );
  if (journalLine) {
    journalLine.reconciled = true;
    await entry.save();
  }

  // Populate the previously-unused BankReconciliation model with real match data —
  // additive: does not change the existing route's own behaviour (see docs/ai/SYSTEM_INVENTORY.md).
  const reconciliation = await BankReconciliation.create({
    tenantId: args.tenantId,
    bankStatementDate: args.date,
    bankBalance: args.amount,
    ledgerBalance: args.amount,
    transactions: [
      {
        date: args.date,
        description: args.description ?? "",
        amount: args.amount,
        type: args.amount >= 0 ? "credit" : "debit",
        bankTransactionId: args.lineId,
        ledgerTransactionId: args.journalLineId,
        status: "matched",
        source: "both",
      },
    ],
    reconciled: true,
    reconciledBy: args.createdBy,
    reconciledAt: new Date(),
    createdBy: args.createdBy,
  });

  return { bankStatementId: args.bankStatementId, journalEntryId: args.journalEntryId, reconciliationId: String(reconciliation._id) };
}

// ── link_evidence ─────────────────────────────────────────────────────────

export interface LinkEvidenceArgs {
  tenantId: string;
  extractedDocumentId: string;
  targetModel: string;
  targetId: string;
  /** Same terminal status the existing manual confirm route sets — lets an auto-drafted
   *  document reach the same end state a human confirm would, so the UI doesn't also
   *  offer to confirm it a second time. */
  markStatus?: string;
}

async function linkEvidenceHandler(args: LinkEvidenceArgs) {
  await connectDB();
  const doc = await ExtractedDocument.findOne({ _id: args.extractedDocumentId, tenantId: args.tenantId });
  if (!doc) throw new Error(`ExtractedDocument ${args.extractedDocumentId} not found`);
  doc.createdRecordModel = args.targetModel;
  doc.createdRecordId = new mongoose.Types.ObjectId(args.targetId);
  if (args.markStatus) doc.status = args.markStatus as typeof doc.status;
  await doc.save();
  return { extractedDocumentId: args.extractedDocumentId, targetModel: args.targetModel, targetId: args.targetId };
}

// ── create_task ───────────────────────────────────────────────────────────

export interface CreateTaskArgs {
  tenantId: string;
  workflowId: string;
  runId: string;
  priority: "critical" | "high" | "medium" | "low" | "info";
  what: string;
  why: string;
  dedupeKey: string;
  evidence?: { kind: string; ref: string; label: string }[];
  impactAmount?: number;
}

async function createTaskHandler(args: CreateTaskArgs) {
  const id = await createAttentionItem(args);
  return { attentionItemId: id };
}

// ── registration ──────────────────────────────────────────────────────────

export function registerFinanceWriteTools(): void {
  registerTool<DraftBillArgs>({
    name: "draft_bill",
    description: "Creates a DRAFT vendor Invoice (moveType in_invoice) — wraps lib/docIntel/billCreate.ts::createDraftBill unchanged.",
    sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
    module: "finance",
    handler: draftBillHandler,
  });

  registerTool<DraftJournalArgs>({
    name: "draft_journal",
    description:
      "Creates a DRAFT JournalEntry (never posted). Delegates Dr=Cr balance and category validation to " +
      "lib/accounting/journal-validation.ts and smart-rules.ts — the accounting policy engine is authoritative " +
      "(Hard Rule 3); a smart-rules veto throws SmartRulesVetoError.",
    sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
    module: "finance",
    handler: draftJournalHandler,
  });

  registerTool<SetDraftAccountArgs>({
    name: "set_draft_account",
    description: "Sets the GL account (and optional Project) on an existing DRAFT Invoice line or Expense — refuses non-draft records (A.5).",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    module: "finance",
    handler: setDraftAccountHandler,
  });

  registerTool<ReconcileTransactionArgs>({
    name: "reconcile_transaction",
    description:
      "Marks a BankStatement line and a JournalEntry line as reconciled, exactly mirroring the existing manual " +
      "reconcile route's logic (including its assertTransactionNotLocked call), and records the match in " +
      "BankReconciliation.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    module: "finance",
    handler: reconcileTransactionHandler,
  });

  registerTool<LinkEvidenceArgs>({
    name: "link_evidence",
    description: "Links an ExtractedDocument to the record created from it — same fields the existing confirm route already sets.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    module: "finance",
    handler: linkEvidenceHandler,
  });

  registerTool<CreateTaskArgs>({
    name: "create_task",
    description: "Creates/updates an attention-engine item (models/ai/AiAttentionItem.ts).",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    // internal_state (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — writes only AiAttentionItem.
    category: "internal_state",
    handler: createTaskHandler,
  });
}

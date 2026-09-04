import connectDB from "@/lib/db";
import mongoose from "mongoose";
import AiSchedule, { AI_SCHEDULE_STATUS, AI_SCHEDULE_PERIOD_STATUS, type AiScheduleType, type AiScheduleFrequency } from "@/models/ai/AiSchedule";
import Asset from "@/models/finance/Asset";
import JournalEntry from "@/models/finance/JournalEntry";
import { AI_AUTONOMY_LEVEL, AI_TOOL_SIDE_EFFECT, DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";
import { buildPeriods, sumPeriodAmounts, buildDepreciationPeriods } from "@/lib/aiRuntime/schedules/scheduleMath";
import { computeMonthlyDepreciation } from "@/lib/accounting/depreciation";
import { buildJournalEntryPayload, type JournalPostingInput } from "@/lib/accounting/posting";
import { journalLinesAreBalanced } from "@/lib/accounting/journal-validation";
import { applySemanticRulesAndClassify } from "@/lib/accounting/smart-rules";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";

/**
 * Batch B Draft + Execute tools (docs/ai/BRIEF-03-BATCH-B.md B.3, A.4). `post_journal` is the
 * first EXECUTE-class tool in this brief and the single highest-risk defect surface in this
 * batch — heavily gated, every precondition checked inside the tool itself so a buggy workflow
 * still cannot double-post or post outside an approved schedule.
 */

export class ScheduleNotApprovedError extends Error {
  constructor(scheduleId: string) {
    super(`AiSchedule ${scheduleId} is not approved — post_journal refuses any other origin`);
    this.name = "ScheduleNotApprovedError";
  }
}

export class PeriodAlreadyPostedError extends Error {
  constructor(scheduleId: string, periodKey: string) {
    super(`AiSchedule ${scheduleId} period ${periodKey} is already posted (or does not exist) — refusing to double-post`);
    this.name = "PeriodAlreadyPostedError";
  }
}

// ── draft_prepaid_schedule ───────────────────────────────────────────────

export interface DraftPrepaidScheduleArgs {
  tenantId: string;
  createdByWorkflow: string;
  scheduleType: AiScheduleType;
  sourceRef: { model: string; id: string };
  startDate: string | Date;
  endDate: string | Date;
  frequency: AiScheduleFrequency;
  totalAmount: number;
  debitAccountId: string;
  creditAccountId: string;
  basis: "stated" | "inferred";
}

async function draftPrepaidScheduleHandler(args: DraftPrepaidScheduleArgs) {
  await connectDB();
  const startDate = new Date(args.startDate);
  const endDate = new Date(args.endDate);
  const periods = buildPeriods(startDate, endDate, args.frequency, args.totalAmount);

  // Invariant 1, asserted here too (not just in the pure math module) — a schedule that
  // doesn't sum is a defect, never silently created.
  const sum = sumPeriodAmounts(periods);
  if (Math.abs(sum - args.totalAmount) > 0.01) {
    throw new Error(`Schedule periods sum to ${sum}, expected ${args.totalAmount}`);
  }

  const schedule = await AiSchedule.create({
    tenantId: args.tenantId,
    scheduleType: args.scheduleType,
    sourceRef: args.sourceRef,
    status: AI_SCHEDULE_STATUS.DRAFT,
    startDate,
    endDate,
    frequency: args.frequency,
    totalAmount: args.totalAmount,
    currency: "INR",
    debitAccountId: args.debitAccountId,
    creditAccountId: args.creditAccountId,
    basis: args.basis,
    periods,
    recognisedToDate: 0,
    remaining: args.totalAmount,
    nextRunDate: periods[0]?.dueDate,
    createdByWorkflow: args.createdByWorkflow,
  });

  return { scheduleId: String(schedule._id), periodCount: periods.length };
}

// ── draft_accrual ─────────────────────────────────────────────────────────

export interface DraftAccrualArgs {
  tenantId: string;
  createdBy: string;
  createdByWorkflow: string;
  header: JournalPostingInput["header"];
  lineIds: JournalPostingInput["lineIds"];
  reversalDate: string | Date;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  sourceRef: { model: string; id: string };
}

async function draftAccrualHandler(args: DraftAccrualArgs) {
  await connectDB();

  const body = {
    tenantId: args.tenantId,
    header: args.header,
    lineIds: args.lineIds,
    status: DOCUMENT_STATUS.DRAFT,
    voucherStatus: "draft",
  };
  const classified = await applySemanticRulesAndClassify(body, args.tenantId);
  if (!classified.ok) throw new Error(`Accounting policy engine vetoed this accrual: ${classified.error}`);

  const payload = await buildJournalEntryPayload({
    tenantId: args.tenantId,
    header: classified.body.header,
    lineIds: classified.body.lineIds ?? args.lineIds,
    status: DOCUMENT_STATUS.DRAFT,
    voucherStatus: "draft",
    voucherType: classified.body.voucherType,
    createdBy: args.createdBy,
  } as JournalPostingInput);
  const entry = await JournalEntry.create(payload);

  // Exactly one reversing AiSchedule, one period, dated next period — "reversal uses the same
  // engine and cannot be forgotten" (B.3).
  const reversalDate = new Date(args.reversalDate);
  const schedule = await AiSchedule.create({
    tenantId: args.tenantId,
    scheduleType: "accrual_reversal",
    sourceRef: args.sourceRef,
    status: AI_SCHEDULE_STATUS.APPROVED, // mechanical once the accrual itself is drafted
    startDate: reversalDate,
    endDate: reversalDate,
    frequency: "monthly",
    totalAmount: args.amount,
    currency: "INR",
    debitAccountId: args.creditAccountId, // reversal flips the legs
    creditAccountId: args.debitAccountId,
    basis: "stated",
    periods: [{ periodKey: `${reversalDate.getUTCFullYear()}-${String(reversalDate.getUTCMonth() + 1).padStart(2, "0")}`, dueDate: reversalDate, amount: args.amount, status: AI_SCHEDULE_PERIOD_STATUS.PENDING }],
    recognisedToDate: 0,
    remaining: args.amount,
    nextRunDate: reversalDate,
    createdByWorkflow: args.createdByWorkflow,
  });

  return { journalEntryId: String(entry._id), reversalScheduleId: String(schedule._id) };
}

// ── draft_depreciation_schedule ─────────────────────────────────────────────
// Mechanical once an Asset is POSTED — same "status: approved immediately" precedent as
// draft_accrual's reversal schedule (docs/ai/BRIEF-03-BATCH-B.md AI-10: "Depreciation drafting
// CONTROLLED_AUTONOMOUS"). Periods come from buildDepreciationPeriods at a FIXED monthly rate
// (computeMonthlyDepreciation's figure — the same formula the existing compute endpoint uses),
// not from buildPeriods's equal-division-of-total, so a mid-period acquisition's first period
// matches what that endpoint would independently produce.

export interface DraftDepreciationScheduleArgs {
  tenantId: string;
  createdByWorkflow: string;
  assetId: string;
}

async function draftDepreciationScheduleHandler(args: DraftDepreciationScheduleArgs) {
  await connectDB();
  const asset = await Asset.findOne({ _id: args.assetId, tenantId: args.tenantId }).lean();
  if (!asset) throw new Error(`Asset ${args.assetId} not found`);

  const monthlyRate = computeMonthlyDepreciation(asset);
  const totalDepreciable = asset.originalValue - asset.salvageValue;
  const periods = buildDepreciationPeriods(asset.purchaseDate, monthlyRate, totalDepreciable);
  if (periods.length === 0) {
    throw new Error(`Asset ${args.assetId} has nothing left to depreciate`);
  }

  const schedule = await AiSchedule.create({
    tenantId: args.tenantId,
    scheduleType: "depreciation",
    sourceRef: { model: "Asset", id: args.assetId },
    status: AI_SCHEDULE_STATUS.APPROVED,
    startDate: asset.purchaseDate,
    endDate: periods[periods.length - 1].dueDate,
    frequency: "monthly",
    totalAmount: totalDepreciable,
    currency: "INR",
    debitAccountId: asset.accounts.depreciationAccountId,
    creditAccountId: asset.accounts.assetAccountId,
    basis: "stated",
    periods,
    recognisedToDate: 0,
    remaining: totalDepreciable,
    nextRunDate: periods[0].dueDate,
    createdByWorkflow: args.createdByWorkflow,
  });

  return { scheduleId: String(schedule._id), periodCount: periods.length };
}

// ── draft_asset ───────────────────────────────────────────────────────────

export interface DraftAssetArgs {
  tenantId: string;
  name: string;
  purchaseDate: string | Date;
  originalValue: number;
  salvageValue: number;
  method: "linear" | "degressive";
  durationYears: number;
  assetAccountId: string;
  depreciationAccountId: string;
}

async function draftAssetHandler(args: DraftAssetArgs) {
  await connectDB();
  const asset = await Asset.create({
    tenantId: args.tenantId,
    name: args.name,
    purchaseDate: new Date(args.purchaseDate),
    originalValue: args.originalValue,
    salvageValue: args.salvageValue,
    method: args.method,
    durationYears: args.durationYears,
    accounts: { assetAccountId: args.assetAccountId, depreciationAccountId: args.depreciationAccountId },
    status: DOCUMENT_STATUS.DRAFT,
  });
  return { assetId: String(asset._id) };
}

// ── post_journal (A.4 — heavily gated) ────────────────────────────────────

export interface PostJournalArgs {
  tenantId: string;
  createdBy: string;
  scheduleId: string;
  periodKey: string;
  header: JournalPostingInput["header"];
  lineIds: JournalPostingInput["lineIds"];
  /** Schedule-period postings (prepaid/deferred/depreciation) are, by their accounting nature,
   *  an expense/income leg offset against an asset/liability drawdown — not against Cash, Bank
   *  or a Liability the way smart-rules.ts's semantic check expects a plain expense/income entry
   *  to be. Set true to convert that veto into a non-blocking, audited warning
   *  (JournalEntry.semanticOverride) instead of throwing — see DraftJournalArgs's identical flag
   *  in financeWriteTools.ts. Never used to bypass a real Dr=Cr imbalance, only this one narrow,
   *  legitimate non-standard pairing. */
  allowNonStandard?: boolean;
  overrideReason?: string;
}

async function postJournalHandler(args: PostJournalArgs) {
  await connectDB();

  const schedule = await AiSchedule.findOne({ _id: args.scheduleId, tenantId: args.tenantId });
  if (!schedule || schedule.status !== AI_SCHEDULE_STATUS.APPROVED) {
    throw new ScheduleNotApprovedError(args.scheduleId);
  }

  // Real period-lock check, before anything else (A.4). "accountant" is the module for
  // general-ledger journal postings not tied to sales/purchases/banking specifically —
  // TRANSACTION_LOCK_MODULE has no "general" value.
  try {
    await assertTransactionNotLocked(args.tenantId, "accountant", args.header.date);
  } catch (err) {
    if (err instanceof TransactionLockError) throw err;
    throw err;
  }

  // Atomic compare-and-swap: only succeeds if the period is not already posted. This is the
  // real "exactly once" guarantee at the schedule level, on top of AiToolCall's own
  // {tenantId, toolName, idempotencyKey} unique index at the callTool() layer.
  const claimed = await AiSchedule.findOneAndUpdate(
    { _id: args.scheduleId, tenantId: args.tenantId, "periods.periodKey": args.periodKey, "periods.status": { $ne: AI_SCHEDULE_PERIOD_STATUS.POSTED } },
    { $set: { "periods.$.status": AI_SCHEDULE_PERIOD_STATUS.DRAFTED } },
    { new: true },
  );
  if (!claimed) throw new PeriodAlreadyPostedError(args.scheduleId, args.periodKey);

  if (!journalLinesAreBalanced(args.lineIds)) {
    throw new Error("post_journal refuses an unbalanced journal — Dr must equal Cr");
  }

  const body = {
    tenantId: args.tenantId,
    header: args.header,
    lineIds: args.lineIds,
    status: DOCUMENT_STATUS.POSTED,
    voucherStatus: "posted",
    allowNonStandard: args.allowNonStandard,
    overrideReason: args.overrideReason,
  };
  const classified = await applySemanticRulesAndClassify(body, args.tenantId);
  if (!classified.ok) throw new Error(`Accounting policy engine vetoed this posting: ${classified.error}`);

  const payload = await buildJournalEntryPayload({
    tenantId: args.tenantId,
    header: classified.body.header,
    lineIds: classified.body.lineIds ?? args.lineIds,
    status: DOCUMENT_STATUS.POSTED,
    voucherStatus: "posted",
    voucherType: classified.body.voucherType,
    createdBy: args.createdBy,
  } as JournalPostingInput);
  const entry = await JournalEntry.create(payload);

  const period = claimed.periods.find((p) => p.periodKey === args.periodKey)!;
  period.status = AI_SCHEDULE_PERIOD_STATUS.POSTED;
  period.journalEntryId = entry._id as mongoose.Types.ObjectId;
  claimed.recognisedToDate += period.amount;
  claimed.remaining = Math.max(0, claimed.remaining - period.amount);
  const nextPending = claimed.periods.find((p) => p.status === AI_SCHEDULE_PERIOD_STATUS.PENDING);
  claimed.nextRunDate = nextPending?.dueDate;
  if (!nextPending) claimed.status = AI_SCHEDULE_STATUS.COMPLETED;
  await claimed.save();

  return { journalEntryId: String(entry._id), scheduleId: args.scheduleId, periodKey: args.periodKey };
}

// ── link_schedule_draft ───────────────────────────────────────────────────
// When autoPostSchedules is false, the period's JournalEntry is created via the existing
// Batch A `draft_journal` tool (stays a real, human-postable DRAFT) — this tool then records
// that linkage on the AiSchedule period (status: "drafted", not "posted") so the schedule's
// own state stays accurate without any workflow ever writing to AiSchedule directly.

export interface LinkScheduleDraftArgs {
  tenantId: string;
  scheduleId: string;
  periodKey: string;
  journalEntryId: string;
}

async function linkScheduleDraftHandler(args: LinkScheduleDraftArgs) {
  await connectDB();
  const updated = await AiSchedule.findOneAndUpdate(
    { _id: args.scheduleId, tenantId: args.tenantId, "periods.periodKey": args.periodKey, "periods.status": AI_SCHEDULE_PERIOD_STATUS.PENDING },
    { $set: { "periods.$.status": AI_SCHEDULE_PERIOD_STATUS.DRAFTED, "periods.$.journalEntryId": new mongoose.Types.ObjectId(args.journalEntryId) } },
    { new: true },
  );
  if (!updated) throw new Error(`AiSchedule ${args.scheduleId} period ${args.periodKey} is not pending — cannot link a new draft`);
  return { scheduleId: args.scheduleId, periodKey: args.periodKey };
}

export function registerScheduleWriteTools(): void {
  registerTool<DraftPrepaidScheduleArgs>({
    name: "draft_prepaid_schedule",
    description: "Creates a new AiSchedule in status:draft with periods built by lib/aiRuntime/schedules/scheduleMath.ts.",
    sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
    // internal_state (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — writes only AiSchedule.
    category: "internal_state",
    handler: draftPrepaidScheduleHandler,
  });

  registerTool<DraftAccrualArgs>({
    name: "draft_accrual",
    description: "Drafts an accrual JournalEntry and creates exactly one reversing AiSchedule dated next period.",
    sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
    module: "finance",
    handler: draftAccrualHandler,
  });

  registerTool<DraftDepreciationScheduleArgs>({
    name: "draft_depreciation_schedule",
    description: "Creates an APPROVED AiSchedule (scheduleType: depreciation) for a POSTED asset, at computeMonthlyDepreciation's fixed monthly rate.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    // internal_state (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — writes only AiSchedule.
    category: "internal_state",
    handler: draftDepreciationScheduleHandler,
  });

  registerTool<DraftAssetArgs>({
    name: "draft_asset",
    description: "Creates a DRAFT (unconfirmed) Asset.",
    sideEffect: AI_TOOL_SIDE_EFFECT.DRAFT,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.DRAFT,
    module: "finance",
    handler: draftAssetHandler,
  });

  registerTool<LinkScheduleDraftArgs>({
    name: "link_schedule_draft",
    description: "Records a draft_journal-created JournalEntry against a pending schedule period (status→drafted), used only when autoPostSchedules is false.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    // internal_state (docs/ai/BRIEF-05-BATCH-D.md Part 0.3) — writes only AiSchedule.
    category: "internal_state",
    handler: linkScheduleDraftHandler,
  });

  registerTool<PostJournalArgs>({
    name: "post_journal",
    description:
      "Posts a JournalEntry — refuses unless it originates from an APPROVED AiSchedule, refuses a period already posted " +
      "(atomic compare-and-swap), checks the real period lock, and delegates all balance/category validation to " +
      "journal-validation.ts + smart-rules.ts. The single highest-risk tool in this batch.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: false,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    module: "finance",
    handler: postJournalHandler,
  });
}

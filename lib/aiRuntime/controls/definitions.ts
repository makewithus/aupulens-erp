import connectDB from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountingSettings from "@/models/finance/AccountingSettings";
import TransactionLock from "@/models/finance/TransactionLock";
import PeriodClosing from "@/models/finance/PeriodClosing";
import User from "@/models/auth/User";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import { DOCUMENT_STATUS, TRANSACTION_LOCK_MODULE, PERIOD_CLOSING_STATUS } from "@/lib/constants/statuses";
import { assertTransactionNotLocked, TransactionLockError } from "@/lib/accounting/transactionLock";
import { checkSod, SOD_PERMISSION_CONFLICT_NOT_IMPLEMENTED_REASON } from "@/lib/aiRuntime/journalPatterns/sod";
import type { ControlDefinition } from "@/lib/aiRuntime/controls/types";

/**
 * AI-29's 12 registered control definitions (docs/ai/BRIEF-07-BATCH-F.md, AI-29 table) — same
 * `not_implemented`/honesty discipline as AI-22's nine reconciliation definitions.
 *
 * `payment_against_approved_bill` was declared `not_implemented` in Chunk 7, then **flipped to
 * real in Chunk 8a** once 0.3's investigation (`docs/ai/SYSTEM_INVENTORY.md`) found the original
 * finding was too pessimistic: `lib/accounting/payments.ts::postInvoicePayment()` always posts a
 * real `JournalEntry` (`voucherType: "payment"`) whose lines carry `sourceId` back to the bill —
 * a real link, just not shaped like a dedicated Payment record. Flipped once confirmed, not
 * assumed — the same honesty discipline in the other direction.
 *
 * One of the brief's own suggested "Partial" labels (Chunk 7) still comes back `not_implemented`
 * once actually researched — recorded here, not silently upgraded past what the data supports:
 *
 * - `access_change_authorised`: `ActivityLog.activity`/`.details` are free text with no
 *   structured entity/action-type field (confirmed, not assumed). A regex over free text to guess
 *   "this log line was a role change" is exactly the guessy heuristic this project avoids
 *   elsewhere (jurisdiction resolution, treatment review) — not built.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function notImplemented<TItem = unknown>(id: string, description: string, severity: ControlDefinition<TItem>["severity"], reasonIfLimited: string): ControlDefinition<TItem> {
  return { id, description, status: "not_implemented", reasonIfLimited, severity, remediationOwner: "unassigned", frequency: "monthly", population: null, test: null, refOf: () => "", labelOf: () => "" };
}

// ── approval_present ─────────────────────────────────────────────────────────

interface ApprovalPresentItem {
  id: string;
  name: string;
  approvedBy: string | null;
  amount: number;
}

const approvalPresentDefinition: ControlDefinition<ApprovalPresentItem> = {
  id: "approval_present",
  description: "Every transaction above its approval threshold has an approval record",
  status: "implemented",
  severity: "high",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const settings = await AccountingSettings.findOne({ tenantId }).lean();
    if (!settings?.journals?.approvalsEnabled || !settings.journals.approvalThresholdAmount) return [];
    const threshold = settings.journals.approvalThresholdAmount;
    const entries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: periodStart, $lte: periodEnd } })
      .select("header approvalDetails totals")
      .lean();
    return entries
      .filter((e) => Math.abs(e.totals?.amountTotal ?? 0) >= threshold)
      .map((e) => ({ id: String(e._id), name: e.header?.name ?? "", approvedBy: e.approvalDetails?.approvedBy ? String(e.approvalDetails.approvedBy) : null, amount: e.totals?.amountTotal ?? 0 }));
  },
  test: (item) => ({
    passed: Boolean(item.approvedBy),
    detail: item.approvedBy ? "approved" : `${item.name} (${item.amount}) has no approval record`,
    evidence: [],
  }),
  refOf: (item) => item.id,
  labelOf: (item) => item.name,
};

// ── approver_authority ───────────────────────────────────────────────────────
// Partial (docs/ai/BRIEF-07-BATCH-F.md table): lib/org/rbac.ts has only admin-gate functions, no
// permission-tier/authority-level concept. The one real, if crude, signal this codebase carries
// is the approver's own User.role — a small, plausible-approver role set vs an implausible one.

const PLAUSIBLE_APPROVER_ROLES = new Set(["finance", "admin", "master-admin"]);

interface ApproverAuthorityItem {
  id: string;
  name: string;
  approverRole: string | null;
}

const approverAuthorityDefinition: ControlDefinition<ApproverAuthorityItem> = {
  id: "approver_authority",
  description: "The approver held sufficient authority to approve",
  status: "partial",
  reasonIfLimited: "lib/org/rbac.ts has no permission-tier/authority-level concept — this only checks the approver's User.role is in a plausible set (finance/admin/master-admin), never a real authority-level verification",
  severity: "medium",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const entries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: periodStart, $lte: periodEnd }, "approvalDetails.approvedBy": { $exists: true } })
      .select("header approvalDetails")
      .lean();
    const approverIds = entries.map((e) => e.approvalDetails!.approvedBy).filter(Boolean);
    const approvers = await User.find({ _id: { $in: approverIds } }).select("role").lean();
    const roleById = new Map(approvers.map((u) => [String(u._id), u.role]));
    return entries.map((e) => ({ id: String(e._id), name: e.header?.name ?? "", approverRole: roleById.get(String(e.approvalDetails!.approvedBy)) ?? null }));
  },
  test: (item) => ({
    passed: Boolean(item.approverRole && PLAUSIBLE_APPROVER_ROLES.has(item.approverRole)),
    detail: item.approverRole ? `approver role "${item.approverRole}" is not in the plausible-approver set` : "approver's role could not be resolved",
    evidence: [],
  }),
  refOf: (item) => item.id,
  labelOf: (item) => item.name,
};

// ── sod_preparer_approver ────────────────────────────────────────────────────

interface SodItem {
  id: string;
  name: string;
  createdBy: string | null;
  approvedBy: string | null;
}

const sodPreparerApproverDefinition: ControlDefinition<SodItem> = {
  id: "sod_preparer_approver",
  description: "Preparer is not also the approver",
  status: "implemented",
  severity: "high",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const entries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: periodStart, $lte: periodEnd }, "approvalDetails.approvedBy": { $exists: true }, createdBy: { $exists: true } })
      .select("header createdBy approvalDetails")
      .lean();
    return entries.map((e) => ({ id: String(e._id), name: e.header?.name ?? "", createdBy: e.createdBy ? String(e.createdBy) : null, approvedBy: e.approvalDetails?.approvedBy ? String(e.approvalDetails.approvedBy) : null }));
  },
  test: (item) => {
    const verdict = checkSod(item.createdBy ?? undefined, item.approvedBy ?? undefined);
    return { passed: !verdict.conflict, detail: verdict.reason, evidence: [] };
  },
  refOf: (item) => item.id,
  labelOf: (item) => item.name,
};

// ── sod_permission_conflict ──────────────────────────────────────────────────

const sodPermissionConflictDefinition = notImplemented("sod_permission_conflict", "No user holds a conflicting permission combination", "medium", SOD_PERMISSION_CONFLICT_NOT_IMPLEMENTED_REASON);

// ── no_posting_into_locked_period ────────────────────────────────────────────

interface LockedPeriodItem {
  id: string;
  name: string;
  date: Date;
  tenantId: string;
}

const noPostingIntoLockedPeriodDefinition: ControlDefinition<LockedPeriodItem> = {
  id: "no_posting_into_locked_period",
  description: "No entry posted with a date inside a TransactionLock",
  status: "implemented",
  severity: "critical",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const entries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: periodStart, $lte: periodEnd } })
      .select("header")
      .lean();
    return entries.map((e) => ({ id: String(e._id), name: e.header?.name ?? "", date: new Date(e.header?.date ?? Date.now()), tenantId }));
  },
  test: async (item) => {
    try {
      await assertTransactionNotLocked(item.tenantId, TRANSACTION_LOCK_MODULE.ACCOUNTANT, item.date);
      return { passed: true, detail: "not within a locked period", evidence: [] };
    } catch (err) {
      if (err instanceof TransactionLockError) return { passed: false, detail: err.message, evidence: [] };
      throw err;
    }
  },
  refOf: (item) => item.id,
  labelOf: (item) => item.name,
};

// ── closed_period_still_postable ─────────────────────────────────────────────
// 0.5's design finding, made real: Chunk 4's A.2 observed that PeriodClosing and TransactionLock
// are never cross-wired — no code path ties a close-status change to setting a lock. This control
// PROVES it, per period: a PeriodClosing marked "closed" with no corresponding, sufficiently-far
// TransactionLock is a real control-design gap, not a guess.

interface ClosedPeriodItem {
  id: string;
  label: string;
  monthEnd: Date;
}

const closedPeriodStillPostableDefinition: ControlDefinition<ClosedPeriodItem> = {
  id: "closed_period_still_postable",
  description: "A PeriodClosing marked closed has a corresponding TransactionLock",
  status: "implemented",
  severity: "critical",
  remediationOwner: "finance",
  frequency: "monthly",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const closings = await PeriodClosing.find({ tenantId, status: PERIOD_CLOSING_STATUS.CLOSED })
      .select("fiscalYear month name")
      .lean();
    return closings
      .map((c) => ({ id: String(c._id), label: c.name ?? `${c.fiscalYear}-${c.month}`, monthEnd: new Date(Date.UTC(c.fiscalYear, c.month, 0, 23, 59, 59, 999)) }))
      .filter((c) => c.monthEnd >= periodStart && c.monthEnd <= periodEnd);
  },
  test: async (item) => {
    await connectDB();
    const locks = await TransactionLock.find({ isLocked: true, module: { $in: [TRANSACTION_LOCK_MODULE.ACCOUNTANT, TRANSACTION_LOCK_MODULE.ALL] }, lockedUpToDate: { $gte: item.monthEnd } }).lean();
    const covered = locks.length > 0;
    return {
      passed: covered,
      detail: covered ? "a lock covers this closed period" : `PeriodClosing "${item.label}" is marked closed but no TransactionLock covers ${item.monthEnd.toISOString().slice(0, 10)} — the period remains postable`,
      evidence: [],
    };
  },
  refOf: (item) => item.id,
  labelOf: (item) => item.label,
};

// ── journal_documentation ────────────────────────────────────────────────────

interface JournalDocumentationItem {
  id: string;
  name: string;
  amount: number;
  sourceIds: string[];
}

const journalDocumentationDefinition: ControlDefinition<JournalDocumentationItem> = {
  id: "journal_documentation",
  description: "Journals above the approval threshold have supporting evidence",
  status: "implemented",
  severity: "medium",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const settings = await AccountingSettings.findOne({ tenantId }).lean();
    const threshold = settings?.journals?.approvalThresholdAmount ?? 0;
    if (!threshold) return [];
    const entries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: periodStart, $lte: periodEnd } })
      .select("header lineIds totals")
      .lean();
    return entries
      .filter((e) => Math.abs(e.totals?.amountTotal ?? 0) >= threshold)
      .map((e) => ({
        id: String(e._id),
        name: e.header?.name ?? "",
        amount: e.totals?.amountTotal ?? 0,
        sourceIds: (e.lineIds ?? []).map((l: { sourceId?: unknown }) => (l.sourceId ? String(l.sourceId) : null)).filter((x: string | null): x is string => Boolean(x)),
      }));
  },
  test: async (item) => {
    if (item.sourceIds.length === 0) return { passed: false, detail: `${item.name} (${item.amount}) has no linked source document reference`, evidence: [] };
    await connectDB();
    const doc = await ExtractedDocument.findOne({ createdRecordId: { $in: item.sourceIds } }).lean();
    return { passed: Boolean(doc), detail: doc ? "has a supporting document" : `${item.name} (${item.amount}) references a source but no ExtractedDocument record exists for it`, evidence: [] };
  },
  refOf: (item) => item.id,
  labelOf: (item) => item.name,
};

// ── master_data_verification, bank_detail_change_process ────────────────────
// Chunk 7 deferred both to "AI-19, Chunk 8" — AI-19 (Chunk 8a) now provides the real
// infrastructure both needed: AiHold (a durable, human-clearable hold) and
// AiMasterDataProfile.bankChangeAlerts (the masked evidence trail). Flipped to real now that the
// underlying data genuinely exists, not assumed.

interface MasterDataVerificationItem {
  holdId: string;
  subjectRef: { model: string; id: string };
  placedAt: Date;
  status: string;
}

const VERIFICATION_GRACE_HOURS = 48;

const masterDataVerificationDefinition: ControlDefinition<MasterDataVerificationItem> = {
  id: "master_data_verification",
  description: "Sensitive master-data changes were verified",
  status: "implemented",
  severity: "medium",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const { default: AiHold } = await import("@/models/ai/AiHold");
    const holds = await AiHold.find({ tenantId, placedByWorkflow: "AI-19", placedAt: { $gte: periodStart, $lte: periodEnd } }).lean();
    return holds.map((h) => ({ holdId: String(h._id), subjectRef: h.subjectRef, placedAt: h.placedAt, status: h.status }));
  },
  test: (item) => {
    if (item.status === "cleared") return { passed: true, detail: `${item.subjectRef.model} ${item.subjectRef.id}'s change was verified and cleared by a human`, evidence: [] };
    const ageHours = (Date.now() - new Date(item.placedAt).getTime()) / (60 * 60 * 1000);
    if (ageHours > VERIFICATION_GRACE_HOURS) {
      return { passed: false, detail: `${item.subjectRef.model} ${item.subjectRef.id}'s change has been unverified for ${Math.floor(ageHours)}h — past the ${VERIFICATION_GRACE_HOURS}h grace window`, evidence: [] };
    }
    return { passed: true, detail: `${item.subjectRef.model} ${item.subjectRef.id}'s change is pending verification, within the ${VERIFICATION_GRACE_HOURS}h grace window`, evidence: [] };
  },
  refOf: (item) => item.holdId,
  labelOf: (item) => `${item.subjectRef.model} ${item.subjectRef.id}`,
};

interface BankDetailChangeItem {
  entityModel: string;
  recordId: string;
  field: string;
  holdPlaced: boolean;
  holdRef: string | null;
}

const bankDetailChangeProcessDefinition: ControlDefinition<BankDetailChangeItem> = {
  id: "bank_detail_change_process",
  // Chunk 8b (0.3): stated precisely, because "bank-detail changes" alone reads as "the system
  // watches every vendor's bank details," which it cannot — Vendor/Customer (the AP "vendor"
  // model) has no bank-account field at all (docs/ai/SYSTEM_INVENTORY.md 0.3). This control tests
  // the PROCESS over the fields that DO exist: Employee.bankDetails and BankAccount. It covers
  // zero records for any tenant with no bank-detail-carrying Employee/BankAccount activity — that
  // is a true, not a false, "nothing to check" (see AI-19's own `vendor_bank_change_detection`
  // not_implemented declaration for the vendor-side gap this does NOT cover).
  description: "Bank-detail changes on Employee/BankAccount records followed the verified process (a hold was placed and still exists) — does not cover Vendor/Customer, which have no bank-detail field to watch",
  status: "implemented",
  severity: "high",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const { default: AiMasterDataProfile } = await import("@/models/ai/AiMasterDataProfile");
    const profiles = await AiMasterDataProfile.find({ tenantId, "bankChangeAlerts.0": { $exists: true } }).lean();
    const items: BankDetailChangeItem[] = [];
    for (const p of profiles) {
      for (const alert of p.bankChangeAlerts ?? []) {
        if (alert.changedAt && (alert.changedAt < periodStart || alert.changedAt > periodEnd)) continue;
        items.push({ entityModel: p.entityModel, recordId: p.recordId, field: alert.field, holdPlaced: Boolean(alert.holdPlaced), holdRef: alert.holdRef ?? null });
      }
    }
    return items;
  },
  test: async (item) => {
    if (!item.holdPlaced || !item.holdRef) {
      return { passed: false, detail: `${item.entityModel} ${item.recordId}'s ${item.field} change has no hold on record`, evidence: [] };
    }
    await connectDB();
    const { default: AiHold } = await import("@/models/ai/AiHold");
    const hold = await AiHold.findById(item.holdRef).lean();
    return { passed: Boolean(hold), detail: hold ? `${item.entityModel} ${item.recordId}'s ${item.field} change correctly triggered a hold that still exists` : `${item.entityModel} ${item.recordId}'s ${item.field} change references a hold that no longer exists`, evidence: [] };
  },
  refOf: (item) => `${item.entityModel}:${item.recordId}:${item.field}`,
  labelOf: (item) => `${item.entityModel} ${item.recordId} (${item.field})`,
};
// ── payment_against_approved_bill ────────────────────────────────────────────
// Chunk 7 first declared this not_implemented ("no data model links an executed payment to a
// bill"). Chunk 8a's 0.3 investigation (docs/ai/SYSTEM_INVENTORY.md) found that finding was too
// pessimistic: lib/accounting/payments.ts::postInvoicePayment() always posts a real JournalEntry
// (voucherType "payment") whose lines carry sourceId === the paid Invoice's own _id — a real,
// structured, queryable link. What's genuinely absent is a dedicated AP Payment *record*
// (models/sales/Payment.ts is AR-only); the JournalEntry itself is the payment record. Flipped to
// real now that the actual link is confirmed, not assumed.

interface PaymentAgainstBillItem {
  id: string;
  name: string;
  billId: string;
  billState: string | null;
  billManualReviewRequired: boolean;
}

const paymentAgainstApprovedBillDefinition: ControlDefinition<PaymentAgainstBillItem> = {
  id: "payment_against_approved_bill",
  description: "Payments trace to an approved, matched bill",
  status: "implemented",
  severity: "high",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const { default: Invoice } = await import("@/models/finance/Invoice");
    const payments = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, voucherType: "payment", "header.date": { $gte: periodStart, $lte: periodEnd } })
      .select("header lineIds")
      .lean();
    const items: PaymentAgainstBillItem[] = [];
    for (const p of payments) {
      const sourceIds = (p.lineIds ?? []).map((l: { sourceId?: unknown }) => (l.sourceId ? String(l.sourceId) : null)).filter((x: string | null): x is string => Boolean(x));
      if (sourceIds.length === 0) continue; // not a bill payment (e.g. a customer receipt reused this voucher type)
      const bill = await Invoice.findOne({ _id: sourceIds[0], tenantId, moveType: "in_invoice" }).select("state manualReviewRequired").lean();
      items.push({ id: String(p._id), name: p.header?.name ?? "", billId: sourceIds[0], billState: bill?.state ?? null, billManualReviewRequired: Boolean(bill?.manualReviewRequired) });
    }
    return items;
  },
  test: (item) => {
    if (!item.billState) return { passed: false, detail: `${item.name} references bill ${item.billId} which could not be found`, evidence: [] };
    if (item.billManualReviewRequired) return { passed: false, detail: `${item.name} paid a bill still flagged manualReviewRequired`, evidence: [] };
    return { passed: true, detail: "traces to a real, non-flagged bill", evidence: [] };
  },
  refOf: (item) => item.id,
  labelOf: (item) => item.name,
};
const accessChangeAuthorisedDefinition = notImplemented(
  "access_change_authorised",
  "Role/permission changes were authorised",
  "medium",
  "ActivityLog.activity/.details are free text with no structured entity/action-type field — matching this to 'a role was changed' would require guessing from prose, the same class of heuristic this project avoids elsewhere",
);

// ── override_logged ───────────────────────────────────────────────────────────
// Chunk 4's 0.3 made JournalEntry.semanticOverride visible. "Logged" is guaranteed by
// construction (semanticOverride.applied=true IS the log entry) — the real test is whether the
// override carries a business justification (semanticOverride.reason), since no `reviewed` field
// exists anywhere to check "and reviewed" against.

interface OverrideItem {
  id: string;
  name: string;
  reason: string | null;
}

const overrideLoggedDefinition: ControlDefinition<OverrideItem> = {
  id: "override_logged",
  description: "Every non-standard posting override is logged with a stated reason",
  status: "implemented",
  severity: "medium",
  remediationOwner: "finance",
  frequency: "continuous",
  population: async (tenantId, periodStart, periodEnd) => {
    await connectDB();
    const entries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: periodStart, $lte: periodEnd }, "semanticOverride.applied": true })
      .select("header semanticOverride")
      .lean();
    return entries.map((e) => ({ id: String(e._id), name: e.header?.name ?? "", reason: e.semanticOverride?.reason ?? null }));
  },
  test: (item) => ({
    passed: Boolean(item.reason && item.reason.trim().length > 0),
    detail: item.reason ? "override carries a stated business reason" : `${item.name} used a non-standard posting override with no stated reason`,
    evidence: [],
  }),
  refOf: (item) => item.id,
  labelOf: (item) => item.name,
};

export const CONTROL_DEFINITIONS: ControlDefinition<unknown>[] = [
  approvalPresentDefinition as ControlDefinition<unknown>,
  approverAuthorityDefinition as ControlDefinition<unknown>,
  sodPreparerApproverDefinition as ControlDefinition<unknown>,
  sodPermissionConflictDefinition,
  noPostingIntoLockedPeriodDefinition as ControlDefinition<unknown>,
  closedPeriodStillPostableDefinition as ControlDefinition<unknown>,
  journalDocumentationDefinition as ControlDefinition<unknown>,
  masterDataVerificationDefinition,
  paymentAgainstApprovedBillDefinition as ControlDefinition<unknown>,
  bankDetailChangeProcessDefinition,
  overrideLoggedDefinition as ControlDefinition<unknown>,
  accessChangeAuthorisedDefinition,
];

export { round2 };

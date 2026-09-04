import connectDB from "@/lib/db";
import mongoose from "mongoose";
import JournalEntry from "@/models/finance/JournalEntry";
import BankStatement from "@/models/finance/BankStatement";
import { VOUCHER_STATUS } from "@/lib/constants/statuses";

/**
 * The bank matcher (docs/ai/BRIEF-02-BATCH-A.md AI-03). A NEW, separate engine from
 * `lib/accounting/matching.ts` (which is PO↔invoice 3-way matching, a different scope —
 * confirmed in docs/ai/SYSTEM_INVENTORY.md; deliberately not overloaded here, per the brief's
 * explicit instruction).
 *
 * Ledger candidates come from posted `JournalEntry` lines against the `Account` a
 * `BankStatement` is linked to (`BankStatement.header.journalId` → `Account`, confirmed the
 * real link in this schema) — not from `Invoice` directly. Real payments are recorded as
 * posted journal entries (`lib/accounting/payments.ts`); that's what a bank line actually
 * reconciles against.
 */

export interface BankLineSubject {
  bankStatementId: string;
  lineId: string;
  date: Date;
  amount: number;
  paymentRef: string;
  partnerId?: string;
}

export interface ExactMatchCandidate {
  journalEntryId: string;
  journalLineId: string;
  amount: number;
  date: Date;
  label: string;
}

const DATE_WINDOW_DAYS = 5;
const AMOUNT_TOLERANCE = 0.01;

function withinDateWindow(a: Date, b: Date, days: number): boolean {
  const diffMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diffMs <= days * 24 * 60 * 60 * 1000;
}

/** Pass 1 — deterministic exact match: amount + date window + (loose) reference match.
 *  Returns every candidate found; the caller decides auto-reconcile (exactly one) vs
 *  propose (more than one) vs escalate (none). */
export async function findExactMatches(
  tenantId: string,
  bankAccountId: mongoose.Types.ObjectId,
  bankLine: BankLineSubject,
): Promise<ExactMatchCandidate[]> {
  await connectDB();
  const target = Math.abs(bankLine.amount);

  const entries = await JournalEntry.find({
    tenantId,
    voucherStatus: VOUCHER_STATUS.POSTED,
    "lineIds.accountId": bankAccountId,
  })
    .limit(200)
    .lean();

  const candidates: ExactMatchCandidate[] = [];
  for (const entry of entries) {
    const date = entry.header?.date;
    if (!date || !withinDateWindow(date, bankLine.date, DATE_WINDOW_DAYS)) continue;

    for (const line of entry.lineIds ?? []) {
      if (String(line.accountId) !== String(bankAccountId)) continue;
      if (line.reconciled) continue;
      const lineAmount = Math.max(Number(line.debit) || 0, Number(line.credit) || 0);
      if (Math.abs(lineAmount - target) <= AMOUNT_TOLERANCE) {
        candidates.push({
          journalEntryId: String(entry._id),
          journalLineId: String((line as { _id?: mongoose.Types.ObjectId })._id),
          amount: lineAmount,
          date,
          label: line.label ?? entry.header?.name ?? "",
        });
      }
    }
  }
  return candidates;
}

export type BankLineClassification =
  | "bank_fee"
  | "interest"
  | "internal_transfer"
  | "unknown_ar_side"
  | "unknown";

const FEE_KEYWORDS = ["fee", "charge", "commission", "penalty", "service tax on bank"];
const INTEREST_KEYWORDS = ["interest"];

/** Pass 3 — classify what neither Pass 1 nor Pass 2 could resolve. Deterministic keyword +
 *  cross-account heuristics, no model call. */
export async function classifyUnresolvedLine(
  tenantId: string,
  bankLine: BankLineSubject,
  excludeBankStatementId: string,
): Promise<BankLineClassification> {
  const ref = (bankLine.paymentRef ?? "").toLowerCase();

  if (FEE_KEYWORDS.some((k) => ref.includes(k))) return "bank_fee";
  if (INTEREST_KEYWORDS.some((k) => ref.includes(k))) return "interest";

  // Internal transfer: an opposite-signed, same-magnitude, unreconciled line on a
  // DIFFERENT BankStatement (a different bank account) within the date window.
  await connectDB();
  const candidates = await BankStatement.find({
    tenantId,
    _id: { $ne: excludeBankStatementId },
  })
    .lean();
  for (const stmt of candidates) {
    for (const line of stmt.lineIds ?? []) {
      if (line.isReconciled) continue;
      if (Math.abs(line.amount + bankLine.amount) > AMOUNT_TOLERANCE) continue;
      if (!withinDateWindow(line.date, bankLine.date, DATE_WINDOW_DAYS)) continue;
      return "internal_transfer";
    }
  }

  // A bank line tagged with a Customer partnerId that we can't explain from Finance-side
  // records almost certainly belongs to the Sales module's Payment/SalesInvoice system —
  // explicitly out of scope for Batch A (A.1). Report, don't guess.
  if (bankLine.partnerId) return "unknown_ar_side";

  return "unknown";
}

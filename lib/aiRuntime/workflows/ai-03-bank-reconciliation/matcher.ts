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

  // Bug found in Chunk 9 verification (docs/ai/BRIEF-09-VERIFICATION.md Part C.1 "Large"): the
  // query used to have NO date filter, just `.limit(200)` with no `.sort()` — for any tenant
  // with more than 200 posted journal entries ever on this bank account, MongoDB's natural
  // (insertion) order means the 200 returned are effectively arbitrary with respect to the
  // bank line's own date, so a genuinely-matching entry could be silently excluded by older,
  // irrelevant entries filling the cap — a real match reported as "Unmatched bank line" for no
  // reason a human could see. Filtering + sorting by the date window BEFORE the limit is what
  // makes the cap apply to the relevant window instead of to an arbitrary slice of history.
  const windowStart = new Date(new Date(bankLine.date).getTime() - DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const windowEnd = new Date(new Date(bankLine.date).getTime() + DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const entries = await JournalEntry.find({
    tenantId,
    voucherStatus: VOUCHER_STATUS.POSTED,
    "lineIds.accountId": bankAccountId,
    "header.date": { $gte: windowStart, $lte: windowEnd },
  })
    .sort({ "header.date": 1 })
    .limit(200)
    .lean();

  const candidates: ExactMatchCandidate[] = [];
  for (const entry of entries) {
    const date = entry.header?.date;
    // Redundant with the query filter above by construction — kept as a defensive
    // double-check (cheap, and protects against a future query change silently widening scope).
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

  // Bug found in Chunk 9 verification's adversarial pass (docs/ai/BRIEF-09-VERIFICATION.md
  // Part C.6): a bank line carrying a Customer partnerId is, by definition, an external
  // receipt/payment — never a transfer between the tenant's own bank accounts. The
  // internal-transfer heuristic below matches purely on amount+date coincidence, with no
  // knowledge of counterparties; checking it BEFORE the partnerId check meant a customer
  // receipt that happened to coincide in amount and date with an unrelated same-tenant transfer
  // got confidently (and silently) mis-explained as "Internal transfer" instead of escalated as
  // `unknown_ar_side` — exactly the "confidently wrong answer" shape this pass exists to catch,
  // and a direct violation of this workflow's own A.1 scope rule ("never guessed at"). Checking
  // partnerId first is the root-cause fix: it can never be shadowed by an amount/date coincidence.
  if (bankLine.partnerId) return "unknown_ar_side";

  // Internal transfer: an opposite-signed, same-magnitude, unreconciled line on a
  // DIFFERENT BankStatement (a different bank account) within the date window.
  //
  // `.limit()` added for the same reason as findExactMatches() above (Part C.1 "Large" — no
  // unbounded query): each BankStatement document is a whole imported batch (many lines), so
  // in practice this stays small, but an unbounded collection-wide scan run once per unresolved
  // line, with no cap, is still a real N+1-shaped risk for a tenant with years of daily imports.
  await connectDB();
  const candidates = await BankStatement.find({
    tenantId,
    _id: { $ne: excludeBankStatementId },
  })
    .limit(2000)
    .lean();
  for (const stmt of candidates) {
    for (const line of stmt.lineIds ?? []) {
      if (line.isReconciled) continue;
      if (Math.abs(line.amount + bankLine.amount) > AMOUNT_TOLERANCE) continue;
      if (!withinDateWindow(line.date, bankLine.date, DATE_WINDOW_DAYS)) continue;
      return "internal_transfer";
    }
  }

  return "unknown";
}

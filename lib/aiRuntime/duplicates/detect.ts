import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import "@/models/sales/Customer"; // registers the Customer model for Invoice's own partnerId populate below
import Expense from "@/models/finance/Expense";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import { findDuplicateEntities } from "@/lib/aiRuntime/masterData/duplicates";
import { normalizeDocNumber, daysBetween } from "@/lib/aiRuntime/duplicates/normalize";
import { PAYMENT_STATE, DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-27's cross-source duplicate detection (docs/ai/BRIEF-08a-BATCH-G.md, AI-27 algorithm).
 * `lib/docIntel/duplicateCheck.ts::findDuplicates()` already does a narrow same-vendor +
 * same-number-or-total check for the extraction confirm flow — this module does NOT replace or
 * modify it (its existing callers, AI-01's extract route and AI-06, must behave identically); it
 * builds a separate, richer, cross-source scorer that reuses `findDuplicateEntities` from AI-19
 * for the duplicate-vendor case rather than re-implementing entity matching.
 *
 * **Chunk 8b (0.1): the same bill paid twice, detected directly.** Chunk 8a's own 0.3
 * investigation (reused by AI-29's `payment_against_approved_bill`) found that
 * `lib/accounting/payments.ts::postInvoicePayment()` posts a real `JournalEntry`
 * (`voucherType: "payment"`) whose lines carry `sourceId` back to the bill it paid. That link is
 * sufficient — not just for tracing one payment to one bill, but for catching **two separate
 * payment postings referencing the same bill**, which is the single highest-confidence duplicate
 * signal available anywhere in this system: `findDuplicatePaymentPostings()` below. No estimate,
 * no scoring, no false-positive risk — two distinct posted payment journals cannot both
 * legitimately exist for the same bill under normal operation, so this is `certain` by
 * construction, not scored against a threshold like the document-level candidates are.
 *
 * What remains genuinely unbuildable (0.3, restated): no *unposted* payment record exists (only
 * `Invoice.paymentState`, a flag) — so this only catches duplicates where BOTH payments were
 * actually posted to the GL. A duplicate caught before either payment posts is Bill-level
 * detection (the `scoreBillPairs` candidates below), not this. And "same bank account paid twice"
 * still has no definitive bill link beyond AI-03's own reconciliation match — that stays the
 * informational-only `findBankPaymentDuplicatePatterns` pattern it always was.
 */

export type DuplicateClassification = "certain" | "probable" | "possible" | "unlikely";

export interface SideBySideField {
  name: string;
  primary: string;
  duplicate: string;
  differs: boolean;
}

export interface DuplicateCandidate {
  sourceModel: "Invoice" | "Expense" | "BankStatementLine";
  primaryRef: string;
  duplicateRef: string;
  score: number;
  classification: DuplicateClassification;
  matchedOn: string[];
  amountAtRisk: number;
  sideBySide: SideBySideField[];
  primaryAlreadyPaid: boolean;
  duplicateAlreadyPaid: boolean;
}

interface BillRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  docNumberNorm: string;
  docNumberRaw: string;
  poReference: string;
  amount: number;
  date: Date;
  fileHash: string | null;
  isPaid: boolean;
}

function classify(score: number): DuplicateClassification {
  if (score >= 90) return "certain";
  if (score >= 60) return "probable";
  if (score >= 30) return "possible";
  return "unlikely";
}

async function loadBillRecords(tenantId: string): Promise<BillRecord[]> {
  await connectDB();
  const bills = await Invoice.find({ tenantId, moveType: "in_invoice", state: { $ne: DOCUMENT_STATUS.CANCELLED } })
    .populate("partnerId", "header.name")
    .select("partnerId sourceDocument poReference amountTotal invoiceDate paymentState state")
    .lean();

  const hashes = await ExtractedDocument.find({ tenantId, createdRecordModel: "Invoice", createdRecordId: { $in: bills.map((b) => b._id) } })
    .select("createdRecordId fileHash")
    .lean();
  const hashByInvoiceId = new Map(hashes.filter((h) => h.fileHash).map((h) => [String(h.createdRecordId), h.fileHash as string]));

  return bills.map((b) => {
    const partner = (b as unknown as { partnerId?: { _id: unknown; header?: { name?: string } } }).partnerId;
    const docNumberRaw = (b as { sourceDocument?: string }).sourceDocument ?? "";
    return {
      id: String(b._id),
      vendorId: partner?._id ? String(partner._id) : "",
      vendorName: partner?.header?.name ?? "",
      docNumberNorm: normalizeDocNumber(docNumberRaw),
      docNumberRaw,
      poReference: (b as { poReference?: string }).poReference ?? "",
      amount: (b as { amountTotal?: number }).amountTotal ?? 0,
      date: new Date((b as { invoiceDate?: Date }).invoiceDate ?? Date.now()),
      fileHash: hashByInvoiceId.get(String(b._id)) ?? null,
      isPaid: (b as { paymentState?: string }).paymentState === PAYMENT_STATE.PAID || (b as { paymentState?: string }).paymentState === PAYMENT_STATE.PARTIAL,
    };
  });
}

function billSideBySide(a: BillRecord, b: BillRecord): SideBySideField[] {
  return [
    { name: "vendor", primary: a.vendorName, duplicate: b.vendorName, differs: a.vendorId !== b.vendorId },
    { name: "document_number", primary: a.docNumberRaw, duplicate: b.docNumberRaw, differs: a.docNumberNorm !== b.docNumberNorm },
    { name: "amount", primary: String(a.amount), duplicate: String(b.amount), differs: a.amount !== b.amount },
    { name: "date", primary: a.date.toISOString().slice(0, 10), duplicate: b.date.toISOString().slice(0, 10), differs: a.date.getTime() !== b.date.getTime() },
    { name: "po_reference", primary: a.poReference, duplicate: b.poReference, differs: a.poReference !== b.poReference },
  ];
}

const CLOSE_DATE_DAYS = 3;
const DUPLICATE_VENDOR_DATE_DAYS = 7;
const SPLIT_DATE_DAYS = 14;

/**
 * The core cross-source scorer over bills. Exported separately from `findBillDuplicateCandidates`
 * so the retrospective sweep (which runs the same scoring tenant-wide, not per-event) reuses this
 * exact logic rather than a second implementation.
 */
export function scoreBillPairs(bills: BillRecord[], duplicateVendorPairs: Set<string>): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  for (let i = 0; i < bills.length; i++) {
    for (let j = i + 1; j < bills.length; j++) {
      const a = bills[i];
      const b = bills[j];
      let score = 0;
      const matchedOn: string[] = [];

      if (a.fileHash && b.fileHash && a.fileHash === b.fileHash) {
        score = Math.max(score, 100);
        matchedOn.push("file_hash");
      }
      if (a.vendorId && a.vendorId === b.vendorId && a.docNumberNorm && a.docNumberNorm === b.docNumberNorm) {
        score = Math.max(score, 100);
        matchedOn.push("document_number");
      }
      if (a.vendorId && a.vendorId === b.vendorId && a.amount > 0 && a.amount === b.amount) {
        if (a.date.getTime() === b.date.getTime()) {
          score = Math.max(score, 95);
          matchedOn.push("amount", "date");
        } else if (daysBetween(a.date, b.date) <= CLOSE_DATE_DAYS) {
          score = Math.max(score, 65);
          matchedOn.push("amount", "near_date");
        }
      }
      if (a.vendorId && b.vendorId && a.vendorId !== b.vendorId && duplicateVendorPairs.has(pairKey(a.vendorId, b.vendorId))) {
        if (a.amount > 0 && a.amount === b.amount && daysBetween(a.date, b.date) <= DUPLICATE_VENDOR_DATE_DAYS) {
          score = Math.max(score, 75);
          matchedOn.push("duplicate_vendor", "amount");
        }
      }
      if (score > 0 && a.poReference && a.poReference === b.poReference) {
        matchedOn.push("po_reference"); // corroborating evidence only — never a standalone trigger (legit multi-instalment POs share a PO)
      }

      if (score < 30) continue; // "unlikely" pairs are noise, not reported
      candidates.push({
        sourceModel: "Invoice",
        primaryRef: a.id,
        duplicateRef: b.id,
        score,
        classification: classify(score),
        matchedOn,
        amountAtRisk: Math.min(a.amount, b.amount),
        sideBySide: billSideBySide(a, b),
        primaryAlreadyPaid: a.isPaid,
        duplicateAlreadyPaid: b.isPaid,
      });
    }
  }

  // The split case: two bills for the same vendor whose amounts sum to a third bill's amount,
  // all within a date window — a real, buildable pattern, not combinatorial guessing across the
  // whole tenant (scoped to one vendor's own bills only).
  const byVendor = new Map<string, BillRecord[]>();
  for (const b of bills) {
    if (!b.vendorId) continue;
    if (!byVendor.has(b.vendorId)) byVendor.set(b.vendorId, []);
    byVendor.get(b.vendorId)!.push(b);
  }
  for (const vendorBills of byVendor.values()) {
    for (let i = 0; i < vendorBills.length; i++) {
      for (let j = i + 1; j < vendorBills.length; j++) {
        for (let k = 0; k < vendorBills.length; k++) {
          if (k === i || k === j) continue;
          const x = vendorBills[i];
          const y = vendorBills[j];
          const z = vendorBills[k];
          if (x.amount <= 0 || y.amount <= 0 || z.amount <= 0) continue;
          if (Math.abs(x.amount + y.amount - z.amount) > 0.01) continue;
          if (daysBetween(x.date, z.date) > SPLIT_DATE_DAYS || daysBetween(y.date, z.date) > SPLIT_DATE_DAYS) continue;
          candidates.push({
            sourceModel: "Invoice",
            primaryRef: z.id,
            duplicateRef: `${x.id}+${y.id}`,
            score: 55,
            classification: classify(55),
            matchedOn: ["split_amount"],
            amountAtRisk: z.amount,
            sideBySide: [
              { name: "vendor", primary: z.vendorName, duplicate: x.vendorName, differs: false },
              { name: "amount", primary: String(z.amount), duplicate: `${x.amount} + ${y.amount}`, differs: false },
            ],
            primaryAlreadyPaid: z.isPaid,
            duplicateAlreadyPaid: x.isPaid || y.isPaid,
          });
        }
      }
    }
  }

  return candidates;
}

export async function findBillDuplicateCandidates(tenantId: string): Promise<DuplicateCandidate[]> {
  const bills = await loadBillRecords(tenantId);
  const duplicateVendorPairs = new Set(
    (await findDuplicateEntities(tenantId, "vendor")).filter((p) => p.classification === "certain" || p.classification === "probable").map((p) => (p.aId < p.bId ? `${p.aId}:${p.bId}` : `${p.bId}:${p.aId}`)),
  );
  return scoreBillPairs(bills, duplicateVendorPairs);
}

export interface ExpenseDuplicateCandidate {
  primaryRef: string;
  duplicateRef: string;
  amountAtRisk: number;
}

/** Expense self-duplicate only — `Expense.ts` has no vendor field (confirmed by schema
 *  inspection), so cross-matching an expense against a vendor bill isn't buildable; this checks
 *  the one real signal available: the same employee submitting the same amount twice, close
 *  together. */
export async function findExpenseDuplicateCandidates(tenantId: string): Promise<ExpenseDuplicateCandidate[]> {
  await connectDB();
  const expenses = await Expense.find({ tenantId, status: { $ne: DOCUMENT_STATUS.REJECTED } }).select("employeeId total expenseDate").lean();
  const candidates: ExpenseDuplicateCandidate[] = [];
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if (String(a.employeeId) !== String(b.employeeId)) continue;
      if (a.total <= 0 || a.total !== b.total) continue;
      if (daysBetween(new Date(a.expenseDate), new Date(b.expenseDate)) > CLOSE_DATE_DAYS) continue;
      candidates.push({ primaryRef: String(a._id), duplicateRef: String(b._id), amountAtRisk: a.total });
    }
  }
  return candidates;
}

export interface BankDuplicatePattern {
  accountId: string;
  primaryRef: string;
  duplicateRef: string;
  amount: number;
}

/** "Same bank account paid twice for similar amounts, where that data exists" — 0.3 confirmed no
 *  bank-statement-to-bill link exists besides AI-03's own reconciliation match, so this reports a
 *  bank-side PATTERN only (two similar outgoing lines on the same account close together), never
 *  a claim about which bill(s) they paid. */
export async function findBankPaymentDuplicatePatterns(tenantId: string): Promise<BankDuplicatePattern[]> {
  await connectDB();
  const statements = await BankStatement.find({ tenantId }).select("header.journalId lineIds").lean();
  const patterns: BankDuplicatePattern[] = [];
  for (const stmt of statements) {
    const accountId = String((stmt as { header?: { journalId?: unknown } }).header?.journalId ?? "");
    const lines = ((stmt as { lineIds?: { _id?: unknown; date?: Date; amount?: number }[] }).lineIds ?? []).filter((l) => (l.amount ?? 0) < 0);
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i];
        const b = lines[j];
        if (!a.amount || a.amount !== b.amount) continue;
        if (daysBetween(new Date(a.date ?? 0), new Date(b.date ?? 0)) > CLOSE_DATE_DAYS) continue;
        patterns.push({ accountId, primaryRef: String(a._id), duplicateRef: String(b._id), amount: Math.abs(a.amount) });
      }
    }
  }
  return patterns;
}

export interface DuplicatePaymentPosting {
  billId: string;
  billName: string;
  billAmount: number;
  paymentIds: string[];
  totalPaid: number;
}

/** The same bill paid via two (or more) separate, posted payment `JournalEntry`s, **summing to
 *  more than the bill's own total** — multiple payments against one bill is normal (instalments),
 *  so the real signal isn't "more than one payment exists," it's an actual overpayment. Detected
 *  directly from `lineIds[].sourceId`, not scored: an overpayment past the bill's stated total is
 *  a real duplicate/over-payment by construction, not a probability. */
export async function findDuplicatePaymentPostings(tenantId: string): Promise<DuplicatePaymentPosting[]> {
  await connectDB();
  const payments = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, voucherType: "payment" })
    .select("header lineIds totals")
    .lean();

  const byBill = new Map<string, { paymentId: string; amount: number }[]>();
  for (const p of payments) {
    const sourceIds = new Set(
      ((p.lineIds ?? []) as { sourceId?: unknown }[]).map((l) => (l.sourceId ? String(l.sourceId) : null)).filter((x): x is string => Boolean(x)),
    );
    for (const billId of sourceIds) {
      if (!byBill.has(billId)) byBill.set(billId, []);
      byBill.get(billId)!.push({ paymentId: String(p._id), amount: (p as { totals?: { amountTotal?: number } }).totals?.amountTotal ?? 0 });
    }
  }

  const results: DuplicatePaymentPosting[] = [];
  for (const [billId, pays] of byBill.entries()) {
    if (pays.length < 2) continue;
    const bill = await Invoice.findOne({ _id: billId, tenantId, moveType: "in_invoice" }).select("name amountTotal").lean();
    if (!bill) continue; // not a vendor bill — a payment voucherType reused for something else
    const totalPaid = Math.round(pays.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    const billAmount = bill.amountTotal ?? 0;
    if (totalPaid <= billAmount + 0.01) continue; // multiple payments summing to the bill total is normal (instalments) — only an overpayment is a real duplicate
    results.push({ billId, billName: bill.name ?? "", billAmount, paymentIds: pays.map((p) => p.paymentId), totalPaid });
  }
  return results;
}

export interface RetrospectiveSweepResult {
  scanned: number;
  found: number;
  totalValue: number;
  recoverable: number;
  byClassification: Record<DuplicateClassification, number>;
}

/** History-wide sweep — same scorer as the per-event path, just over every bill the tenant has,
 *  quantifying what's already been paid twice (or is at risk of being) rather than only the newest
 *  document. "Recoverable" = the duplicate side's amount, for pairs where at least one side has
 *  already been paid — money that could still be clawed back. */
export async function runRetrospectiveSweep(tenantId: string): Promise<{ result: RetrospectiveSweepResult; candidates: DuplicateCandidate[]; duplicatePayments: DuplicatePaymentPosting[] }> {
  const bills = await loadBillRecords(tenantId);
  const candidates = await findBillDuplicateCandidates(tenantId);
  const duplicatePayments = await findDuplicatePaymentPostings(tenantId);
  const alreadyPaidPairs = candidates.filter((c) => c.classification !== "unlikely" && (c.primaryAlreadyPaid || c.duplicateAlreadyPaid));

  const byClassification: Record<DuplicateClassification, number> = { certain: 0, probable: 0, possible: 0, unlikely: 0 };
  let totalValue = 0;
  let recoverable = 0;
  for (const c of candidates) {
    byClassification[c.classification]++;
    totalValue += c.amountAtRisk;
  }
  for (const c of alreadyPaidPairs) {
    recoverable += c.amountAtRisk;
  }
  // Duplicate payment postings are certain by construction and already-posted overpayments —
  // the most directly recoverable figure this sweep produces, folded in rather than reported
  // separately and easy to miss.
  for (const dp of duplicatePayments) {
    byClassification.certain++;
    const overpaid = Math.round((dp.totalPaid - dp.billAmount) * 100) / 100;
    totalValue += overpaid;
    recoverable += overpaid;
  }

  return {
    result: { scanned: bills.length, found: candidates.length + duplicatePayments.length, totalValue: Math.round(totalValue * 100) / 100, recoverable: Math.round(recoverable * 100) / 100, byClassification },
    candidates,
    duplicatePayments,
  };
}

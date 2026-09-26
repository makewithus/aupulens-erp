import type mongoose from "mongoose";
import JournalEntry from "@/models/finance/JournalEntry";
import Account from "@/models/finance/Account";
import type { ISalesInvoice } from "@/models/sales/SalesInvoice";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { validateJournalLinesForPosting } from "@/lib/accounting/journal-validation";
import { VOUCHER_TYPE } from "@/lib/constants/statuses";

const RECEIVABLE_CODE = "1200";
const REVENUE_CODE = "4100";
const GST_PAYABLE_CODE = "2160";
const TCS_PAYABLE_CODE = "2170";
const TDS_RECEIVABLE_CODE = "1210";

const POSTING_EPSILON = 0.005;

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export interface SalesInvoiceSnapshot {
  taxableAmount: number;
  totalTax: number;
  tcsAmount: number;
  tdsAmount: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  roundOffAmount?: number;
}

const ZERO_SNAPSHOT: SalesInvoiceSnapshot = { taxableAmount: 0, totalTax: 0, tcsAmount: 0, tdsAmount: 0 };

const ACCOUNT_CODE_LABELS: Record<string, string> = {
  [RECEIVABLE_CODE]: "Accounts Receivable",
  [REVENUE_CODE]: "Sales Revenue",
  [GST_PAYABLE_CODE]: "GST Output Tax Payable",
  [TCS_PAYABLE_CODE]: "TCS Payable",
  [TDS_RECEIVABLE_CODE]: "TDS Receivable",
};

/**
 * Fetches every account this posting might need in one query instead of a
 * separate round-trip per code — this function runs on the hot path of
 * every invoice save, so 5 sequential DB calls here was real, measurable
 * latency added by Issue #9's GL posting work.
 */
async function resolveAccountsByCode(tenantId: string, codes: string[]) {
  const accounts = await Account.find({ tenantId, code: { $in: codes } });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  return (code: string) => {
    const account = byCode.get(code);
    if (!account) {
      throw new Error(
        `${ACCOUNT_CODE_LABELS[code] || code} account not found in Chart of Accounts. Configure it under Chart of Accounts before posting this invoice.`,
      );
    }
    return account;
  };
}

/**
 * Posts (or reclasses/reverses) the General Ledger impact of a Sales
 * Invoice, by diffing its current { taxableAmount, totalTax, tcsAmount,
 * tdsAmount } against the snapshot last posted for it
 * (`invoice.postedSnapshot`) — the same diff-based pattern as
 * postCustomerPaymentJournal in lib/accounting/payments.ts, for the same
 * reason: one formula naturally covers initial post, edits (reclass), and
 * reversal (current = ZERO_SNAPSHOT when the invoice goes back to draft or
 * is cancelled) without a separate code path for each.
 *
 * Posts Dr Accounts Receivable (for the full invoice total this creates:
 * taxableAmount + totalTax + tcsAmount − tdsAmount, matching
 * SalesInvoice.totalAmount exactly) against Cr Revenue (taxableAmount),
 * Cr GST Output Tax Payable (totalTax), Cr TCS Payable (tcsAmount), and
 * Dr TDS Receivable (tdsAmount).
 *
 * TDS is booked as a receivable when issued. Payment routes prevent adding
 * it again for allocations to an invoice that already recorded TDS.
 * Component snapshots preserve CGST/SGST/IGST across edits and reversals;
 * snapshots from older invoices retain the combined GST ledger until reclassed.
 *
 * Mutates `invoice.postedSnapshot` and appends to `invoice.journalEntryIds`
 * on a successful post — the caller is responsible for `invoice.save()`.
 */
export async function postSalesInvoiceJournal({
  invoice,
  tenantId,
  createdBy,
  current,
  idempotencyKey,
}: {
  invoice: ISalesInvoice & { _id: mongoose.Types.ObjectId };
  tenantId: string;
  createdBy: string;
  current: SalesInvoiceSnapshot;
  idempotencyKey?: string;
}): Promise<mongoose.Types.ObjectId | null> {
  const previous: SalesInvoiceSnapshot = invoice.postedSnapshot || ZERO_SNAPSHOT;

  if (idempotencyKey) {
    const existing = await JournalEntry.findOne({ tenantId, "header.name": idempotencyKey });
    if (existing) {
      invoice.postedSnapshot = current;
      invoice.journalEntryIds = [existing._id as mongoose.Types.ObjectId];
      return existing._id as mongoose.Types.ObjectId;
    }
  }
  const taxParts = (snapshot: SalesInvoiceSnapshot) => ({
    "2160": roundCurrency(snapshot.totalTax - (snapshot.cgst || 0) - (snapshot.sgst || 0) - (snapshot.igst || 0)),
    "2161": snapshot.cgst || 0, "2162": snapshot.sgst || 0, "2163": snapshot.igst || 0,
  });
  const nowTax = taxParts(current), oldTax = taxParts(previous);
  const taxDeltas = Object.entries(nowTax).map(([code, amount]) => ({ code, amount: roundCurrency(amount - oldTax[code as keyof typeof oldTax]) }));
  const dRound = roundCurrency((current.roundOffAmount || 0) - (previous.roundOffAmount || 0));
  const dTaxable = roundCurrency(current.taxableAmount - previous.taxableAmount);
  const dTax = roundCurrency(current.totalTax - previous.totalTax);
  const dTcs = roundCurrency(current.tcsAmount - previous.tcsAmount);
  const dTds = roundCurrency(current.tdsAmount - previous.tdsAmount);

  if (
    Math.abs(dTaxable) < POSTING_EPSILON &&
    Math.abs(dTax) < POSTING_EPSILON &&
    Math.abs(dTcs) < POSTING_EPSILON &&
    Math.abs(dTds) < POSTING_EPSILON &&
    Math.abs(dRound) < POSTING_EPSILON &&
    taxDeltas.every((d) => Math.abs(d.amount) < POSTING_EPSILON)
  ) {
    return null; // idempotent no-op — nothing changed since the last post
  }

  await ensureChartOfAccounts(tenantId, createdBy);

  const narration = `Invoice ${invoice.number}`;
  const lines: any[] = [];
  const pushLine = (accountId: any, amount: number, label: string) => {
    if (Math.abs(amount) < POSTING_EPSILON) return;
    lines.push({
      accountId,
      partnerId: invoice.customerId,
      label,
      debit: amount > 0 ? roundCurrency(amount) : 0,
      credit: amount < 0 ? roundCurrency(-amount) : 0,
      sourceDocument: invoice.number,
      sourceId: invoice._id,
    });
  };

  const neededCodes = [RECEIVABLE_CODE, REVENUE_CODE];
  for (const d of taxDeltas) if (Math.abs(d.amount) >= POSTING_EPSILON) neededCodes.push(d.code);
  if (Math.abs(dTcs) >= POSTING_EPSILON) neededCodes.push(TCS_PAYABLE_CODE);
  if (Math.abs(dTds) >= POSTING_EPSILON) neededCodes.push(TDS_RECEIVABLE_CODE);
  const resolveAccount = await resolveAccountsByCode(tenantId, neededCodes);

  const receivableAccount = resolveAccount(RECEIVABLE_CODE);
  const arDelta = roundCurrency(dTaxable + dTax + dTcs - dTds + dRound);
  pushLine(receivableAccount._id, arDelta, narration);

  const revenueAccount = resolveAccount(REVENUE_CODE);
  pushLine(revenueAccount._id, -dTaxable, narration);
  pushLine(revenueAccount._id, -dRound, `Rounding — ${narration}`);

  for (const d of taxDeltas) {
    if (Math.abs(d.amount) < POSTING_EPSILON) continue;
    pushLine(resolveAccount(d.code)._id, -d.amount, `${({ "2160": "GST", "2161": "CGST", "2162": "SGST", "2163": "IGST" } as Record<string, string>)[d.code]} — ${narration}`);
  }

  if (Math.abs(dTcs) >= POSTING_EPSILON) {
    const tcsAccount = resolveAccount(TCS_PAYABLE_CODE);
    pushLine(tcsAccount._id, -dTcs, `TCS collected — ${narration}`);
  }

  if (Math.abs(dTds) >= POSTING_EPSILON) {
    const tdsAccount = resolveAccount(TDS_RECEIVABLE_CODE);
    pushLine(tdsAccount._id, dTds, `TDS deducted — ${narration}`);
  }

  const validationError = validateJournalLinesForPosting(lines);
  if (validationError) {
    throw new Error(validationError);
  }

  const journalEntry = await createPostedJournalEntry({
    tenantId,
    header: {
      name: idempotencyKey,
      date: invoice.invoiceDate || new Date(),
      ref: invoice.number,
      journalType: "sale",
    },
    voucherType: VOUCHER_TYPE.SALES,
    lineIds: lines,
    createdBy,
  });

  invoice.postedSnapshot = current;
  invoice.journalEntryIds = [...(invoice.journalEntryIds || []), journalEntry._id as mongoose.Types.ObjectId];

  return journalEntry._id as mongoose.Types.ObjectId;
}

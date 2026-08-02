import type mongoose from "mongoose";
import Account from "@/models/Account";
import type { ISalesInvoice } from "@/models/SalesInvoice";
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
 * Assumption (flagged per the ground rules — confirm if this doesn't match
 * house accounting policy): TDS is booked as a receivable at invoice-
 * issuance time, not only when the customer actually pays and deducts it.
 * This keeps AR (= SalesInvoice.totalAmount, which the Payments module
 * already treats as "the amount owed") exactly balanced against Revenue +
 * GST + TCS − TDS, matching how computeInvoiceTotals already defines
 * totalAmount. The alternative (booking TDS only at payment time) is
 * arguably more conservative but would leave AR permanently overstated by
 * the TDS amount unless payment-side posting is also reworked to match —
 * out of scope here since lib/accounting/payments.ts's existing TDS
 * handling is driven by an independent, user-entered field on the Payment
 * itself, not the invoice's own tds rate.
 *
 * Mutates `invoice.postedSnapshot` and appends to `invoice.journalEntryIds`
 * on a successful post — the caller is responsible for `invoice.save()`.
 */
export async function postSalesInvoiceJournal({
  invoice,
  tenantId,
  createdBy,
  current,
}: {
  invoice: ISalesInvoice & { _id: mongoose.Types.ObjectId };
  tenantId: string;
  createdBy: string;
  current: SalesInvoiceSnapshot;
}): Promise<mongoose.Types.ObjectId | null> {
  const previous: SalesInvoiceSnapshot = invoice.postedSnapshot || ZERO_SNAPSHOT;

  const dTaxable = roundCurrency(current.taxableAmount - previous.taxableAmount);
  const dTax = roundCurrency(current.totalTax - previous.totalTax);
  const dTcs = roundCurrency(current.tcsAmount - previous.tcsAmount);
  const dTds = roundCurrency(current.tdsAmount - previous.tdsAmount);

  if (
    Math.abs(dTaxable) < POSTING_EPSILON &&
    Math.abs(dTax) < POSTING_EPSILON &&
    Math.abs(dTcs) < POSTING_EPSILON &&
    Math.abs(dTds) < POSTING_EPSILON
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
  if (Math.abs(dTax) >= POSTING_EPSILON) neededCodes.push(GST_PAYABLE_CODE);
  if (Math.abs(dTcs) >= POSTING_EPSILON) neededCodes.push(TCS_PAYABLE_CODE);
  if (Math.abs(dTds) >= POSTING_EPSILON) neededCodes.push(TDS_RECEIVABLE_CODE);
  const resolveAccount = await resolveAccountsByCode(tenantId, neededCodes);

  const receivableAccount = resolveAccount(RECEIVABLE_CODE);
  const arDelta = roundCurrency(dTaxable + dTax + dTcs - dTds);
  pushLine(receivableAccount._id, arDelta, narration);

  const revenueAccount = resolveAccount(REVENUE_CODE);
  pushLine(revenueAccount._id, -dTaxable, narration);

  if (Math.abs(dTax) >= POSTING_EPSILON) {
    const gstAccount = resolveAccount(GST_PAYABLE_CODE);
    pushLine(gstAccount._id, -dTax, `GST — ${narration}`);
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

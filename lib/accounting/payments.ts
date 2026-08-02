import type mongoose from "mongoose";
import Account from "@/models/Account";
import Invoice from "@/models/Invoice";
import Customer from "@/models/Customer";
import type { IPayment, IPaymentPostedSnapshot } from "@/models/Payment";
import {
  DOCUMENT_STATUS,
  PAYMENT_STATE,
  VOUCHER_TYPE,
  type PaymentState,
} from "@/lib/constants/statuses";
import { ensureChartOfAccounts } from "@/lib/accounting/coa-seeder";
import { createPostedJournalEntry } from "@/lib/accounting/posting";
import { validateJournalLinesForPosting } from "@/lib/accounting/journal-validation";

type InvoiceDocument = InstanceType<typeof Invoice>;

export type PaymentPostingResult = {
  amountApplied: number;
  residual: number;
  paymentState: PaymentState;
  journalEntryId?: mongoose.Types.ObjectId;
};

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

export function derivePaymentState({
  residual,
  total,
  dueDate,
}: {
  residual: number;
  total: number;
  dueDate?: Date;
}): PaymentState {
  if (residual <= 0.01) return PAYMENT_STATE.PAID;
  if (residual < total) return PAYMENT_STATE.PARTIAL;

  if (dueDate && dueDate.getTime() < Date.now()) {
    return PAYMENT_STATE.OVERDUE;
  }

  return PAYMENT_STATE.NOT_PAID;
}

export function getPaymentResidualForPosting({
  amountResidual,
  amountTotal,
  paymentState,
}: {
  amountResidual?: number;
  amountTotal: number;
  paymentState?: PaymentState;
}) {
  const total = roundCurrency(Number(amountTotal) || 0);
  const storedResidual = roundCurrency(
    Number(amountResidual ?? amountTotal) || 0,
  );

  if (
    paymentState !== PAYMENT_STATE.PAID &&
    storedResidual <= 0.01 &&
    total > 0
  ) {
    return total;
  }

  return storedResidual;
}

async function getDefaultAccount({
  tenantId,
  accountType,
}: {
  tenantId: string;
  accountType: string;
}) {
  return Account.findOne({ tenantId, account_type: accountType });
}

async function resolvePaymentAccount({
  tenantId,
  paymentAccountId,
}: {
  tenantId: string;
  paymentAccountId?: string;
}) {
  if (paymentAccountId) {
    const account = await Account.findOne({ _id: paymentAccountId, tenantId });
    if (!account) {
      throw new Error("Payment account was not found for this tenant.");
    }
    return account;
  }

  const cashAccount = await getDefaultAccount({
    tenantId,
    accountType: "asset_cash",
  });

  if (!cashAccount) {
    throw new Error("No default cash/bank account found for this tenant.");
  }

  return cashAccount;
}

async function resolveOpenItemAccount(invoice: any, tenantId: string) {
  if (invoice.moveType === "out_invoice") {
    if (invoice.receivableAccountId) return invoice.receivableAccountId;

    const receivable = await getDefaultAccount({
      tenantId,
      accountType: "asset_receivable",
    });
    if (!receivable) {
      throw new Error("No default Accounts Receivable account found.");
    }

    invoice.receivableAccountId = receivable._id;
    return receivable._id;
  }

  if (invoice.moveType === "in_invoice") {
    if (invoice.payableAccountId) return invoice.payableAccountId;

    const payable = await getDefaultAccount({
      tenantId,
      accountType: "liability_payable",
    });
    if (!payable) {
      throw new Error("No default Accounts Payable account found.");
    }

    invoice.payableAccountId = payable._id;
    return payable._id;
  }

  throw new Error("Payments are only supported for invoices and vendor bills.");
}

export async function postInvoicePayment({
  invoice,
  tenantId,
  createdBy,
  amount,
  paymentDate = new Date(),
  paymentAccountId,
  reference,
}: {
  invoice: InvoiceDocument;
  tenantId: string;
  createdBy: string;
  amount?: number;
  paymentDate?: Date;
  paymentAccountId?: string;
  reference?: string;
}): Promise<PaymentPostingResult> {
  if (invoice.state !== DOCUMENT_STATUS.POSTED) {
    throw new Error("Invoice or bill must be posted before payment.");
  }

  await ensureChartOfAccounts(tenantId, createdBy);

  const total = roundCurrency(Number(invoice.amountTotal) || 0);
  const currentResidual = getPaymentResidualForPosting({
    amountResidual: Number(invoice.amountResidual),
    amountTotal: total,
    paymentState: invoice.paymentState,
  });

  if (currentResidual <= 0.01) {
    invoice.amountResidual = 0;
    invoice.paymentState = PAYMENT_STATE.PAID;
    if (!invoice.paidDate) invoice.paidDate = paymentDate;

    return {
      amountApplied: 0,
      residual: 0,
      paymentState: PAYMENT_STATE.PAID,
    };
  }

  const requestedAmount =
    amount === undefined ? currentResidual : roundCurrency(Number(amount) || 0);
  if (requestedAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const amountApplied = roundCurrency(Math.min(requestedAmount, currentResidual));
  const residual = roundCurrency(currentResidual - amountApplied);
  const paymentState = derivePaymentState({
    residual,
    total,
    dueDate: invoice.dueDate,
  });

  const isCustomerReceipt = invoice.moveType === "out_invoice";
  const voucherType = isCustomerReceipt
    ? VOUCHER_TYPE.RECEIPT
    : VOUCHER_TYPE.PAYMENT;
  const paymentAccount = await resolvePaymentAccount({
    tenantId,
    paymentAccountId,
  });
  const openItemAccountId = await resolveOpenItemAccount(invoice, tenantId);
  const label = isCustomerReceipt
    ? `Customer receipt for ${invoice.name}`
    : `Vendor payment for ${invoice.name}`;

  const journalLines = isCustomerReceipt
    ? [
        {
          accountId: paymentAccount._id,
          partnerId: invoice.partnerId,
          label,
          debit: amountApplied,
          credit: 0,
          sourceDocument: invoice.name,
          sourceId: invoice._id,
        },
        {
          accountId: openItemAccountId,
          partnerId: invoice.partnerId,
          label,
          debit: 0,
          credit: amountApplied,
          sourceDocument: invoice.name,
          sourceId: invoice._id,
        },
      ]
    : [
        {
          accountId: openItemAccountId,
          partnerId: invoice.partnerId,
          label,
          debit: amountApplied,
          credit: 0,
          sourceDocument: invoice.name,
          sourceId: invoice._id,
        },
        {
          accountId: paymentAccount._id,
          partnerId: invoice.partnerId,
          label,
          debit: 0,
          credit: amountApplied,
          sourceDocument: invoice.name,
          sourceId: invoice._id,
        },
      ];

  const journalEntry = await createPostedJournalEntry({
    tenantId,
    header: {
      date: paymentDate,
      ref: reference || `${invoice.name}:${voucherType}`,
      journalType: "bank",
    },
    voucherType,
    lineIds: journalLines,
    totals: {
      amountUntaxed: amountApplied,
      amountTax: 0,
      amountTotal: amountApplied,
    },
    createdBy,
  });

  invoice.amountResidual = residual;
  invoice.paymentState = paymentState;
  if (paymentState === PAYMENT_STATE.PAID) {
    invoice.paidDate = paymentDate;
  }

  return {
    amountApplied,
    residual,
    paymentState,
    journalEntryId: journalEntry._id as mongoose.Types.ObjectId,
  };
}

// ============================================================
//  Sales / customer Payment GL posting
//
//  Reuses the exact same createPostedJournalEntry -> buildJournalEntryPayload
//  -> validateJournalLinesForPosting pipeline as postInvoicePayment above —
//  no parallel posting mechanism. Operates on the Sales module's `Payment`
//  model (distinct from the Finance `Invoice`/vendor-bill flow above).
// ============================================================

const CUSTOMER_ADVANCES_CODE = "2150";
const BANK_CHARGES_CODE = "5150";
const TDS_RECEIVABLE_CODE = "1210";
const POSTING_EPSILON = 0.005;

export interface CustomerPaymentSnapshot {
  /** Sum of payment.allocations[].amount — must equal the AR credit exactly (see consistency check in QA_GAP_REPORT §7). */
  allocatedTotal: number;
  /** payment.unusedAmount — the portion becoming/leaving Customer Advances. */
  unusedAmount: number;
  bankCharges: number;
  tdsAmount: number;
}

const ZERO_PAYMENT_SNAPSHOT: CustomerPaymentSnapshot = {
  allocatedTotal: 0,
  unusedAmount: 0,
  bankCharges: 0,
  tdsAmount: 0,
};

async function resolveAccountByCode(tenantId: string, code: string, label: string) {
  const account = await Account.findOne({ tenantId, code });
  if (!account) {
    throw new Error(
      `${label} account not found in Chart of Accounts. Configure it under Chart of Accounts before posting this payment.`,
    );
  }
  return account;
}

async function resolveReceivableAccountForPosting(tenantId: string) {
  const account = await getDefaultAccount({ tenantId, accountType: "asset_receivable" });
  if (!account) {
    throw new Error("Accounts Receivable account not found in Chart of Accounts. Configure it before posting this payment.");
  }
  return account;
}

async function resolveDepositAccountForPosting(
  tenantId: string,
  depositToAccountId?: mongoose.Types.ObjectId | string,
) {
  if (depositToAccountId) {
    const account = await Account.findOne({ _id: depositToAccountId, tenantId });
    if (!account) {
      throw new Error("Deposit To account was not found for this tenant.");
    }
    return account;
  }
  const fallback = await getDefaultAccount({ tenantId, accountType: "asset_cash" });
  if (!fallback) {
    throw new Error("No default cash/bank account found for this tenant. Select a Deposit To account.");
  }
  return fallback;
}

/**
 * Posts (or reverses/reclasses) the General Ledger impact of a customer
 * Payment, by diffing its current allocation/charges/TDS state against the
 * snapshot last posted for it (`payment.postedSnapshot`).
 *
 * This single diff-based function naturally covers every scenario in one
 * formula rather than needing a separate code path per case:
 *   - Initial post (postedSnapshot absent, treated as all-zero): posts the
 *     full entry — Dr Deposit-To (net of charges/TDS) [+ Dr Bank Charges]
 *     [+ Dr TDS Receivable], Cr AR (= allocatedTotal exactly) [+ Cr Customer
 *     Advances for any unused/excess amount].
 *   - Excess later applied to a new invoice (allocatedTotal up, unusedAmount
 *     down by the same amount, nothing else changed): the bank-side deltas
 *     cancel out to zero, leaving a clean two-line reclass — Dr Customer
 *     Advances / Cr AR — with no new cash line, exactly matching real-world
 *     "apply existing credit" bookkeeping.
 *   - Void (current = all-zero): every delta is the negative of what was
 *     last posted, producing an exact mirror-image reversal entry. The
 *     original entry is never mutated — this always creates a new one.
 *   - No real change (e.g. re-saving with identical amounts, or a duplicate
 *     request): every delta is ~0, so this returns null and posts nothing —
 *     the idempotency guarantee.
 *
 * Derivation: given the identity (already enforced by
 * lib/sales/paymentAllocation.ts's validateAllocations) that
 *   amountReceived = allocatedTotal + unusedAmount + bankCharges + tdsAmount
 * the only way to give bankCharges and tdsAmount their own real debit lines
 * while keeping `Cr AR === allocatedTotal` exactly (required so the GL
 * control account matches the invoice subledger) and the entry balanced, is
 * Dr-Bank = (allocatedTotal + unusedAmount) − bankCharges − tdsAmount. Applying
 * this to *deltas* rather than absolute values is what makes every scenario
 * above fall out of one formula. Verified against the required conventions:
 * Dr Bank Charges/Cr nothing extra reduces the bank Dr line (rule 2); Dr TDS
 * Receivable funds AR relief instead of cash (rule 3); Dr/Cr Customer
 * Advances for excess and its later reclass (rules 4/6); pure Dr Bank / Cr
 * Customer Advances for a retainer with no allocations (rule 5).
 *
 * Mutates `payment.postedSnapshot` and appends to `payment.journalEntryIds`
 * on a successful post — the caller is responsible for `payment.save()`.
 * Never posts when the resulting entry would have zero net lines (draft
 * payments must call this with `current = ZERO_PAYMENT_SNAPSHOT`, which is a
 * no-op unless something was previously posted, in which case it reverses).
 */
export async function postCustomerPaymentJournal({
  payment,
  tenantId,
  createdBy,
  current,
  invoiceNumbers = [],
}: {
  payment: IPayment;
  tenantId: string;
  createdBy: string;
  current: CustomerPaymentSnapshot;
  invoiceNumbers?: string[];
}): Promise<mongoose.Types.ObjectId | null> {
  const previous: CustomerPaymentSnapshot = payment.postedSnapshot || ZERO_PAYMENT_SNAPSHOT;

  const dAlloc = roundCurrency(current.allocatedTotal - previous.allocatedTotal);
  const dUnused = roundCurrency(current.unusedAmount - previous.unusedAmount);
  const dCharges = roundCurrency(current.bankCharges - previous.bankCharges);
  const dTds = roundCurrency(current.tdsAmount - previous.tdsAmount);

  if (
    Math.abs(dAlloc) < POSTING_EPSILON &&
    Math.abs(dUnused) < POSTING_EPSILON &&
    Math.abs(dCharges) < POSTING_EPSILON &&
    Math.abs(dTds) < POSTING_EPSILON
  ) {
    return null; // idempotent no-op — nothing changed since the last post
  }

  await ensureChartOfAccounts(tenantId, createdBy);

  const bankDr = roundCurrency(dAlloc + dUnused - dCharges - dTds);
  const needsBankCharges = Math.abs(dCharges) >= POSTING_EPSILON;
  const needsTds = Math.abs(dTds) >= POSTING_EPSILON;
  const needsAdvances = Math.abs(dUnused) >= POSTING_EPSILON;

  // These use three different query shapes (by _id, by account_type, by
  // code) so they can't be folded into one batched query the way
  // salesInvoicePosting.ts's same-shape lookups were — but they (and the
  // customer lookup for the narration) are all independent of each other,
  // so running them concurrently instead of sequentially still cuts this
  // from ~6 round-trips to ~1 round-trip's worth of wall-clock time on the
  // hot path of every payment posting.
  const [customer, depositAccount, bankChargesAccount, tdsAccount, receivableAccount, advancesAccount] = await Promise.all([
    Customer.findOne({ _id: payment.customerId, tenantId }).select("header.name header.displayName").lean(),
    resolveDepositAccountForPosting(tenantId, payment.depositToAccountId),
    needsBankCharges ? resolveAccountByCode(tenantId, BANK_CHARGES_CODE, "Bank Charges") : null,
    needsTds ? resolveAccountByCode(tenantId, TDS_RECEIVABLE_CODE, "TDS Receivable") : null,
    resolveReceivableAccountForPosting(tenantId),
    needsAdvances ? resolveAccountByCode(tenantId, CUSTOMER_ADVANCES_CODE, "Customer Advances") : null,
  ]);

  const customerName = (customer as any)?.header?.displayName || (customer as any)?.header?.name || "Customer";
  const narration = `Payment ${payment.paymentNumber} from ${customerName}${
    invoiceNumbers.length ? ` against ${invoiceNumbers.join(", ")}` : ""
  }`;

  const lines: any[] = [];
  const pushLine = (accountId: any, amount: number, label: string) => {
    if (Math.abs(amount) < POSTING_EPSILON) return;
    lines.push({
      accountId,
      partnerId: payment.customerId,
      label,
      debit: amount > 0 ? roundCurrency(amount) : 0,
      credit: amount < 0 ? roundCurrency(-amount) : 0,
      sourceDocument: payment.paymentNumber,
      sourceId: payment._id,
    });
  };

  pushLine(depositAccount._id, bankDr, narration);
  if (bankChargesAccount) pushLine(bankChargesAccount._id, dCharges, `Bank charges — ${narration}`);
  if (tdsAccount) pushLine(tdsAccount._id, dTds, `TDS deducted — ${narration}`);
  pushLine(receivableAccount._id, -dAlloc, narration);
  if (advancesAccount) pushLine(advancesAccount._id, -dUnused, `Customer advance — ${narration}`);

  const validationError = validateJournalLinesForPosting(lines);
  if (validationError) {
    throw new Error(validationError);
  }

  const journalEntry = await createPostedJournalEntry({
    tenantId,
    header: {
      date: payment.paymentDate,
      ref: payment.paymentNumber,
      journalType: "bank",
    },
    voucherType: VOUCHER_TYPE.RECEIPT,
    lineIds: lines,
    createdBy,
  });

  payment.postedSnapshot = current as IPaymentPostedSnapshot;
  payment.journalEntryIds = [...(payment.journalEntryIds || []), journalEntry._id as mongoose.Types.ObjectId];

  return journalEntry._id as mongoose.Types.ObjectId;
}

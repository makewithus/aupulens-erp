import type mongoose from "mongoose";
import Account from "@/models/Account";
import Invoice from "@/models/Invoice";
import {
  DOCUMENT_STATUS,
  PAYMENT_STATE,
  VOUCHER_TYPE,
  type PaymentState,
} from "@/lib/constants/statuses";
import { createPostedJournalEntry } from "@/lib/accounting/posting";

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

  const total = roundCurrency(Number(invoice.amountTotal) || 0);
  const currentResidual = roundCurrency(
    Number(invoice.amountResidual ?? invoice.amountTotal) || 0,
  );

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

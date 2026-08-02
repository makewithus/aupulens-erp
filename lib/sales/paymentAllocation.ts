import mongoose from "mongoose";
import { SalesInvoice } from "@/models/SalesInvoice";
import Payment from "@/models/Payment";
import { resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";
import { generatePaymentNumber } from "@/lib/sales/paymentNumbering";
import { postCustomerPaymentJournal } from "@/lib/accounting/payments";
import { PAYMENT_STATUS, PAYMENT_TYPE, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";
import { advanceSaleOrderOnInvoicePaid } from "@/lib/sales/q2cSync";

// The core relational behavior of the Payments module: applying a payment's
// allocations to the invoices it's paying off, and cleanly reversing that on
// void/edit. Kept in one place (rather than inlined in the route handlers)
// since it's the most bug-prone piece per the spec and the one place tests
// target directly.
//
// Caller must have already called connectDB().

export interface AllocationInput {
  invoiceId: string;
  amount: number;
}

/** Sum of allocation amounts, defensive against non-numeric input. */
export function sumAllocations(allocations: AllocationInput[]): number {
  return allocations.reduce((acc, a) => acc + (Number(a.amount) || 0), 0);
}

/**
 * Validates that allocations are well-formed and don't exceed the amount
 * actually available to apply (amount received minus bank charges/TDS
 * withheld at source). Throws with a user-facing message on violation.
 */
export function validateAllocations(
  allocations: AllocationInput[],
  amountReceived: number,
  bankCharges: number,
  tdsAmount: number,
): number {
  const netAvailable = Math.max(0, amountReceived - bankCharges - tdsAmount);
  const totalApplied = sumAllocations(allocations);
  if (totalApplied - netAvailable > 0.005) {
    throw new Error("Total applied payment cannot exceed the amount received.");
  }
  for (const a of allocations) {
    if (!a.invoiceId) throw new Error("Each allocation row requires an invoice.");
    if (Number(a.amount) < 0) throw new Error("Applied amounts cannot be negative.");
  }
  return Math.max(0, netAvailable - totalApplied); // unusedAmount
}

/**
 * Guards against allocating more than an invoice's actual remaining
 * balance. Nothing previously checked this server-side — the "Amount Due"
 * column on the Record Payment form is computed from a snapshot fetched
 * once on page load (components/sales/payments/PaymentForm.tsx), so a
 * second submission against the same invoice (double-click, browser
 * back+resubmit, a second tab, or the Receivables list simply not having
 * been refreshed since an earlier payment) was silently accepted in full —
 * that's the root cause of "the same invoice shows again and the payment
 * gets recorded twice." Throws with a user-facing message on violation;
 * caller is responsible for fetching invoices with `totalAmount` and
 * `payments` selected.
 */
export function validateAllocationAmounts(
  allocations: AllocationInput[],
  invoices: { _id: any; number: string; totalAmount: number; payments?: { amount: number }[] }[],
): void {
  const byId = new Map(invoices.map((inv) => [String(inv._id), inv]));
  for (const alloc of allocations) {
    const invoice = byId.get(String(alloc.invoiceId));
    if (!invoice) continue; // missing/wrong-tenant invoices are rejected separately by the caller
    const paidSoFar = (invoice.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const due = Math.max(0, Number(invoice.totalAmount) - paidSoFar);
    if (Number(alloc.amount) - due > 0.005) {
      throw new Error(
        `Invoice ${invoice.number} only has ₹${due.toFixed(2)} outstanding, but ₹${Number(alloc.amount).toFixed(2)} was applied to it. It may have already been paid by an earlier submission — refresh and try again.`,
      );
    }
  }
}

/**
 * Pushes one payment entry per allocation onto the corresponding invoice's
 * legacy `payments[]` subdocument (tagged with paymentId so it can be found
 * again on reversal) and re-derives that invoice's status — this is what
 * keeps pre-existing invoice-status logic and any other reader of
 * SalesInvoice.payments correct without a schema migration.
 */
export async function applyAllocationsToInvoices(params: {
  tenantId: string;
  paymentId: string;
  paymentNumber: string;
  paymentDate: Date;
  mode: string;
  allocations: AllocationInput[];
}): Promise<void> {
  const { tenantId, paymentId, paymentNumber, paymentDate, mode, allocations } = params;

  for (const alloc of allocations) {
    if (!alloc.amount) continue;
    const invoice = await (SalesInvoice as any).findOne({ _id: alloc.invoiceId, tenantId });
    if (!invoice) continue; // invoice may have been deleted since the form loaded; skip rather than fail the whole payment

    invoice.payments.push({
      amount: Number(alloc.amount),
      date: paymentDate,
      mode,
      notes: `Payment ${paymentNumber}`,
      paymentId,
    });
    invoice.status = resolveInvoiceStatus({
      requestedStatus: invoice.status,
      totalAmount: invoice.totalAmount,
      payments: invoice.payments,
      markedFullyPaid: invoice.markedFullyPaid,
      dueDate: invoice.dueDate,
    });
    await invoice.save();

    if (invoice.status === SALES_INVOICE_STATUS.PAID) {
      await advanceSaleOrderOnInvoicePaid(tenantId, invoice._id);
    }
  }
}

/**
 * Reverses everything applyAllocationsToInvoices did for a given payment:
 * pulls its tagged entries back out of every invoice's payments[] and
 * re-derives status. Used by void and by edit-then-resave.
 */
export async function reverseAllocationsOnInvoices(tenantId: string, paymentId: string): Promise<void> {
  const invoices = await (SalesInvoice as any).find({ tenantId, "payments.paymentId": paymentId });

  for (const invoice of invoices) {
    invoice.payments = invoice.payments.filter((p: any) => String(p.paymentId || "") !== String(paymentId));
    invoice.status = resolveInvoiceStatus({
      requestedStatus: invoice.status,
      totalAmount: invoice.totalAmount,
      payments: invoice.payments,
      markedFullyPaid: invoice.markedFullyPaid,
      dueDate: invoice.dueDate,
    });
    await invoice.save();
  }
}

/**
 * Auto-records a real, GL-correct Payment when an invoice is marked fully
 * paid (InvoiceForm.tsx's "Mark as fully paid" checkbox) without enough
 * real payments to actually cover it.
 *
 * Previously `markedFullyPaid` was purely cosmetic: it only flipped
 * `invoice.status` to "paid" (lib/sales/invoiceStatus.ts), with no Payment
 * record and no GL entry at all. Since Accounts Receivable is debited in
 * full when an invoice is posted (postSalesInvoiceJournal) regardless of
 * payment status, that left AR permanently overstated — and if the
 * customer separately had unapplied advance credit sitting in Customer
 * Advances (2150) that a user meant to apply here instead of ticking this
 * box, that credit was stranded there forever, matching the reported "due
 * cleared but still shows under Customer Advances" symptom. Confirmed live:
 * 11 existing invoices had markedFullyPaid=true with $0 or partial real
 * payments backing them.
 *
 * Creates a genuine Payment (mode "Marked as Fully Paid", fully allocated
 * to this invoice, using the tenant's default deposit account) through the
 * same tested `postCustomerPaymentJournal` pipeline every other payment
 * uses, and pushes the matching entry onto `invoice.payments[]` — so AR is
 * actually relieved and the invoice's own due-amount stays consistent.
 * Caller is responsible for rolling this back (delete the Payment + its
 * journalEntryIds) if anything later in the same request fails, the same
 * way the invoice routes already roll back invoice-level GL postings.
 */
export async function settleInvoiceShortfallWithSystemPayment(params: {
  tenantId: string;
  customerId: string;
  invoice: any;
  amount: number;
  createdBy: string;
  paymentDate?: Date;
}): Promise<{ paymentId: mongoose.Types.ObjectId; journalEntryIds: mongoose.Types.ObjectId[] }> {
  const { tenantId, customerId, invoice, amount, createdBy, paymentDate = new Date() } = params;
  const rounded = Math.round(amount * 100) / 100;

  const { number: paymentNumber } = await generatePaymentNumber(tenantId);
  const payment = await Payment.create({
    tenantId,
    customerId,
    paymentNumber,
    paymentDate,
    amountReceived: rounded,
    bankCharges: 0,
    mode: "Marked as Fully Paid",
    allocations: [{ invoiceId: invoice._id, amount: rounded }],
    unusedAmount: 0,
    status: PAYMENT_STATUS.PAID,
    paymentType: PAYMENT_TYPE.INVOICE_PAYMENT,
    notes: `Auto-recorded because invoice ${invoice.number} was marked fully paid without a matching payment.`,
    createdBy,
  });

  await postCustomerPaymentJournal({
    payment,
    tenantId,
    createdBy,
    current: { allocatedTotal: rounded, unusedAmount: 0, bankCharges: 0, tdsAmount: 0 },
    invoiceNumbers: [invoice.number],
  });
  await payment.save();

  invoice.payments.push({
    amount: rounded,
    date: paymentDate,
    mode: "Marked as Fully Paid",
    notes: `Auto-recorded (invoice marked fully paid)`,
    paymentId: payment._id,
  });

  return { paymentId: payment._id as mongoose.Types.ObjectId, journalEntryIds: payment.journalEntryIds || [] };
}

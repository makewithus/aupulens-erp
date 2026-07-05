import { SalesInvoice } from "@/models/SalesInvoice";
import { resolveInvoiceStatus } from "@/lib/sales/invoiceStatus";

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

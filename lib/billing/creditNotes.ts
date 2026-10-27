import BillingCreditNote from "@/models/billing/BillingCreditNote";
import BillingInvoice from "@/models/billing/BillingInvoice";
import BillingPayment from "@/models/billing/BillingPayment";
import BillingRefund from "@/models/billing/BillingRefund";
import Counter from "@/models/shared/Counter";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function issueCreditNoteForRefund(refundId: string) {
  const existing = await BillingCreditNote.findOne({ refundId });
  if (existing) return existing;

  const refund = await BillingRefund.findById(refundId);
  if (!refund || refund.status !== "processed") {
    throw new Error("Credit notes require a provider-confirmed processed refund.");
  }
  const [payment, invoice] = await Promise.all([
    BillingPayment.findById(refund.paymentRecordId),
    BillingInvoice.findOne({ paymentId: String(refund.paymentRecordId), tenantId: refund.tenantId }),
  ]);
  if (!payment || !invoice) throw new Error("Refund source payment or issued invoice was not found.");

  // The adjustment is a proportional snapshot of the immutable original
  // invoice. Finance must approve jurisdiction-specific tax treatment before
  // this allocation is treated as a legally approved tax calculation.
  const ratio = Math.min(1, refund.amountPaise / Math.round(invoice.totalAmount * 100));
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Credit-note allocation base is invalid.");
  const totalAmount = money(refund.amountPaise / 100);
  const cgst = money(invoice.cgst * ratio);
  const sgst = money(invoice.sgst * ratio);
  const igst = money(invoice.igst * ratio);
  const totalTax = money(cgst + sgst + igst);
  const taxableAmount = money(totalAmount - totalTax);

  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { tenantId: "platform", key: `saas_credit_note:${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const creditNoteNumber = `CN-SAAS-${year}-${String(counter.seq).padStart(6, "0")}`;
  try {
    return await BillingCreditNote.create({
      creditNoteNumber,
      tenantId: refund.tenantId,
      paymentId: String(payment._id),
      refundId: refund._id,
      invoiceId: invoice.invoiceNumber,
      issuedAt: new Date(),
      currency: invoice.currency,
      seller: { ...invoice.seller },
      customer: { ...invoice.customer },
      lines: [{
        description: `Refund adjustment for ${invoice.invoiceNumber}`,
        taxableAmount,
        cgst,
        sgst,
        igst,
        total: totalAmount,
      }],
      taxableAmount,
      cgst,
      sgst,
      igst,
      totalTax,
      totalAmount,
      reason: refund.reason,
      allocationMethod: "proportional_to_original_invoice",
    });
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const duplicate = await BillingCreditNote.findOne({ refundId });
    if (duplicate) return duplicate;
    throw error;
  }
}

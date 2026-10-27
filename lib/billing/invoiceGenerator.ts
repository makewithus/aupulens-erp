import Counter from "@/models/shared/Counter";
import BillingInvoice, { IBillingInvoice } from "@/models/billing/BillingInvoice";
import Organization from "@/models/admin/Organization";
import { IBillingPayment } from "@/models/billing/BillingPayment";
import { ISaaSSubscription } from "@/models/billing/SaaSSubscription";
import { DEFAULT_SELLER_STATE } from "./proration";

export const DEFAULT_SELLER_DETAILS = {
  name: "Aupulens Technologies Private Limited",
  address: "Level 4, Tech Park, Outer Ring Road, Bangalore 560103",
  gstin: "29AABCA1234F1Z5",
  state: DEFAULT_SELLER_STATE,
  pan: "AABCA1234F",
  email: "billing@aupulens.com",
};

export async function getNextSaaSInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const counterKey = `saas_invoice:${year}`;
  const counter = await Counter.findOneAndUpdate(
    { tenantId: "platform", key: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const seqStr = String(counter.seq).padStart(6, "0");
  return `INV-SAAS-${year}-${seqStr}`;
}

export async function generateBillingInvoice(params: {
  payment: IBillingPayment;
  subscription: ISaaSSubscription;
  description?: string;
}): Promise<IBillingInvoice> {
  const { payment, subscription } = params;

  // Retrieve customer organization details
  const org = await Organization.findOne({ subdomain: payment.tenantId });
  const customerState = org?.settings?.state || DEFAULT_SELLER_STATE;
  const customerAddress = [
    org?.settings?.addressLine1,
    org?.settings?.addressLine2,
    org?.settings?.city,
    org?.settings?.pincode,
  ]
    .filter(Boolean)
    .join(", ");

  const invoiceNumber = await getNextSaaSInvoiceNumber();
  const receiptNumber = `REC-${invoiceNumber.replace("INV-", "")}`;

  const description =
    params.description ||
    (payment.type === "upgrade"
      ? `Subscription Upgrade to ${subscription.planKey.toUpperCase()} Plan (Prorated)`
      : payment.type === "renewal"
      ? `Subscription Renewal for ${subscription.planKey.toUpperCase()} Plan (${subscription.billingCycle})`
      : `Subscription for ${subscription.planKey.toUpperCase()} Plan (${subscription.billingCycle})`);

  const invoice = await BillingInvoice.create({
    invoiceNumber,
    tenantId: payment.tenantId,
    organizationId: org?._id,
    paymentId: String(payment._id),
    subscriptionId: String(subscription._id),
    invoiceDate: new Date(),
    dueDate: new Date(),
    status: "paid",
    seller: DEFAULT_SELLER_DETAILS,
    customer: {
      name: org?.name || payment.tenantId,
      address: customerAddress || "Not specified",
      gstin: org?.settings?.gstin,
      state: customerState,
      email: DEFAULT_SELLER_DETAILS.email,
    },
    lineItems: [
      {
        description,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        qty: 1,
        unitPrice: payment.taxBreakup.taxableAmount,
        taxableValue: payment.taxBreakup.taxableAmount,
        taxRate: payment.taxBreakup.totalTax > 0 ? 18 : 0,
        taxAmount: payment.taxBreakup.totalTax,
        total: payment.amount,
      },
    ],
    taxableAmount: payment.taxBreakup.taxableAmount,
    cgst: payment.taxBreakup.cgst,
    sgst: payment.taxBreakup.sgst,
    igst: payment.taxBreakup.igst,
    totalTax: payment.taxBreakup.totalTax,
    totalAmount: payment.amount,
    currency: payment.currency,
    isInterState: payment.taxBreakup.isInterState,
    placeOfSupply: customerState,
    paymentReference: payment.razorpayPaymentId || payment.razorpayOrderId,
    receiptNumber,
    notes: "Payment received in full. Thank you for choosing Aupulens ERP.",
  });

  // Link invoice back to payment
  payment.invoiceId = invoice.invoiceNumber;
  payment.receiptNumber = receiptNumber;
  await payment.save();

  return invoice;
}

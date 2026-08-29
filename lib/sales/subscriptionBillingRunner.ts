import Subscription from "@/models/sales/Subscription";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { generateInvoiceNumber } from "@/lib/sales/invoiceNumbering";
import { addBillingPeriods } from "@/lib/sales/subscriptionBilling";
import { onPaymentFailure } from "@/lib/sales/dunningEngine";
import { dispatchSubscriptionEvent } from "@/lib/sales/webhookDispatch";
import { getPaymentGatewayService } from "@/lib/sales/paymentGateway";
import { addDays } from "date-fns";
import {
  SALES_SUBSCRIPTION_STATUS,
  SALES_INVOICE_STATUS,
} from "@/lib/constants/statuses";
import "@/models/sales/Customer";

export interface BillingRunResult {
  billed: number;
  expired: number;
  paymentFailures: number;
}

/**
 * The engine behind the subscription lifecycle diagram (§4.1): for every
 * subscription whose nextBillingOn has arrived, raises a real SalesInvoice
 * for the cycle, attempts autocharge for online-payment subscriptions (via
 * the stub payment gateway — see lib/sales/paymentGateway.ts), and either
 * advances the schedule or expires the subscription once expiresOn is
 * reached. Trial subscriptions convert to active on their first bill.
 *
 * Note: `autoRenew` only drives the "Non-Renewing" view/reporting today —
 * actual termination is still governed by expiresOn/expiresAfterCycles or a
 * manual cancel, since deriving "last cycle before non-renewal" cleanly
 * would need additional schedule bookkeeping this pass didn't need.
 */
export async function runSubscriptionBilling(tenantId: string): Promise<BillingRunResult> {
  const now = new Date();
  const due = await (Subscription as any).find({
    tenantId,
    status: { $in: [SALES_SUBSCRIPTION_STATUS.TRIAL, SALES_SUBSCRIPTION_STATUS.ACTIVE, SALES_SUBSCRIPTION_STATUS.NON_RENEWING] },
    nextBillingOn: { $lte: now },
  });

  let billed = 0;
  let expired = 0;
  let paymentFailures = 0;

  for (const subscription of due) {
    const wasFirstCycle = (subscription.generatedInvoiceIds?.length || 0) === 0;

    if (subscription.status === SALES_SUBSCRIPTION_STATUS.TRIAL) {
      subscription.status = SALES_SUBSCRIPTION_STATUS.ACTIVE;
      subscription.activatedOn = now;
    }

    const { number } = await generateInvoiceNumber(tenantId);
    const invoice = new SalesInvoice({
      tenantId,
      number,
      customerId: subscription.customerId,
      invoiceDate: now,
      dueDate: addDays(now, 7),
      lineItems: subscription.lineItems,
      taxableAmount: subscription.subTotal,
      totalDiscount: 0,
      totalAmount: subscription.totalAmount,
      taxes: { tds: 0, tcs: 0, gstBreakup: [] },
      status: SALES_INVOICE_STATUS.SAVED,
      notes: `Generated for subscription ${subscription.number} (${subscription.profileName})`,
    });
    await invoice.save();

    subscription.generatedInvoiceIds = [...(subscription.generatedInvoiceIds || []), invoice._id];
    subscription.lastBilledOn = now;
    subscription.unbilledCharges = 0;
    billed++;

    await dispatchSubscriptionEvent(tenantId, wasFirstCycle ? "activated" : "renewed", {
      subscriptionId: String(subscription._id),
      invoiceId: String(invoice._id),
    });

    if (subscription.paymentMode === "online") {
      const gateway = getPaymentGatewayService();
      const result = await gateway.attemptAutocharge(String(invoice._id), subscription.totalAmount);
      if (!result.success) {
        await subscription.save(); // persist the invoice link before the dunning engine reloads/mutates status
        await onPaymentFailure(tenantId, String(subscription._id));
        paymentFailures++;
        continue;
      }
    }

    const willExpire =
      !subscription.neverExpires && subscription.expiresOn && now >= new Date(subscription.expiresOn);

    if (willExpire) {
      subscription.status = SALES_SUBSCRIPTION_STATUS.EXPIRED;
      subscription.nextBillingOn = undefined;
      expired++;
      await subscription.save();
      await dispatchSubscriptionEvent(tenantId, "expired", { subscriptionId: String(subscription._id) });
    } else {
      subscription.nextBillingOn = addBillingPeriods(new Date(subscription.nextBillingOn), subscription.billingFrequency, 1);
      await subscription.save();
    }
  }

  return { billed, expired, paymentFailures };
}

import { addDays } from "date-fns";
import Subscription from "@/models/Subscription";
import DunningRule, { type IDunningChannelConfig } from "@/models/DunningRule";
import { SalesInvoice } from "@/models/SalesInvoice";
import EmailTemplate from "@/models/EmailTemplate";
import { getEmailService, renderTemplate } from "@/lib/email/sendEmail";
import { getPaymentGatewayService } from "@/lib/sales/paymentGateway";
import { dispatchSubscriptionEvent } from "@/lib/sales/webhookDispatch";
import {
  SALES_SUBSCRIPTION_STATUS,
  DUNNING_FINAL_SUBSCRIPTION_ACTION,
  DUNNING_FINAL_INVOICE_ACTION,
  SALES_INVOICE_STATUS,
} from "@/lib/constants/statuses";
import "@/models/Customer";

async function getDefaultRule(tenantId: string) {
  return DunningRule.findOne({ tenantId, isDefault: true }).lean();
}

async function sendDunningEmail(tenantId: string, ruleId: string, action: string, subscription: any) {
  const key = `dunning:${ruleId}:${action}`;
  let template = await EmailTemplate.findOne({ tenantId, key });
  if (!template) {
    template = await EmailTemplate.create({
      tenantId,
      key,
      name: action.replace(/_/g, " "),
      subject: "Regarding your subscription {{planName}}",
      body: "Hi {{customerName}}, this concerns your subscription {{planName}} (amount {{amount}}).",
    });
  }
  const email = subscription.customerId?.contact_details?.email;
  if (!email) return;
  const emailService = getEmailService();
  await emailService.send({
    to: email,
    subject: renderTemplate(template.subject, { planName: subscription.profileName, amount: subscription.totalAmount }),
    body: renderTemplate(template.body, {
      customerName: subscription.customerId?.header?.displayName || subscription.customerId?.header?.name || "Customer",
      planName: subscription.profileName,
      amount: subscription.totalAmount,
    }),
  });
}

/** Called when a subscription's invoice payment attempt fails (autocharge or overdue). */
export async function onPaymentFailure(tenantId: string, subscriptionId: string): Promise<void> {
  const rule = await getDefaultRule(tenantId);
  const subscription = await (Subscription as any)
    .findOne({ _id: subscriptionId, tenantId })
    .populate("customerId", "header contact_details");
  if (!subscription) return;

  const channel: IDunningChannelConfig = (rule?.autocharge as any) || { retries: [] };
  const firstRetry = channel.retries?.[0];

  subscription.status = SALES_SUBSCRIPTION_STATUS.DUNNING;
  subscription.dunningRuleId = rule?._id;
  subscription.dunningRetryCount = 0;
  subscription.nextDunningRetryAt = firstRetry ? addDays(new Date(), firstRetry.afterDays) : undefined;
  await subscription.save();

  if (rule) await sendDunningEmail(tenantId, String(rule._id), "on-failure", subscription);
  await dispatchSubscriptionEvent(tenantId, "payment_failed", { subscriptionId: String(subscription._id) });
}

/** Called when a previously-failing subscription's invoice is paid. */
export async function onPaymentSuccess(tenantId: string, subscriptionId: string): Promise<void> {
  const rule = await getDefaultRule(tenantId);
  const subscription = await (Subscription as any)
    .findOne({ _id: subscriptionId, tenantId })
    .populate("customerId", "header contact_details");
  if (!subscription) return;

  const wasDunning = subscription.status === SALES_SUBSCRIPTION_STATUS.DUNNING;
  subscription.status = SALES_SUBSCRIPTION_STATUS.ACTIVE;
  subscription.dunningRetryCount = 0;
  subscription.nextDunningRetryAt = undefined;
  await subscription.save();

  if (wasDunning && rule) await sendDunningEmail(tenantId, String(rule._id), "on-success", subscription);
}

async function applyFinalActions(tenantId: string, subscription: any, channel: IDunningChannelConfig) {
  if (channel.finalSubscriptionAction === DUNNING_FINAL_SUBSCRIPTION_ACTION.CANCEL_SUBSCRIPTION) {
    subscription.status = SALES_SUBSCRIPTION_STATUS.CANCELLED;
    subscription.cancelledAt = new Date();
    await dispatchSubscriptionEvent(tenantId, "cancelled", { subscriptionId: String(subscription._id) });
  } else if (channel.finalSubscriptionAction === DUNNING_FINAL_SUBSCRIPTION_ACTION.MARK_UNPAID) {
    subscription.status = SALES_SUBSCRIPTION_STATUS.UNPAID;
  }
  await subscription.save();

  if (channel.finalInvoiceAction !== DUNNING_FINAL_INVOICE_ACTION.DO_NOTHING) {
    const lastInvoiceId = subscription.generatedInvoiceIds?.[subscription.generatedInvoiceIds.length - 1];
    if (lastInvoiceId) {
      const newStatus =
        channel.finalInvoiceAction === DUNNING_FINAL_INVOICE_ACTION.MARK_VOID
          ? SALES_INVOICE_STATUS.CANCELLED
          : SALES_INVOICE_STATUS.PAID; // "write off" — treated as closed-out for reporting since no separate write-off status exists
      await (SalesInvoice as any).updateOne({ _id: lastInvoiceId, tenantId }, { $set: { status: newStatus } });
    }
  }
}

/**
 * Evaluated by the dunning-retries cron: for every subscription due for a
 * retry, re-attempts the (stub) autocharge. On failure, either schedules the
 * next retry step or — once retries are exhausted — applies the rule's final
 * actions. On an unexpected success it defers to onPaymentSuccess.
 */
export async function processDunningRetries(tenantId: string): Promise<{ processed: number }> {
  const now = new Date();
  const subscriptions = await (Subscription as any)
    .find({ tenantId, status: SALES_SUBSCRIPTION_STATUS.DUNNING, nextDunningRetryAt: { $lte: now } })
    .populate("customerId", "header contact_details");

  let processed = 0;
  for (const subscription of subscriptions) {
    const rule = subscription.dunningRuleId
      ? await DunningRule.findOne({ _id: subscription.dunningRuleId, tenantId }).lean()
      : await getDefaultRule(tenantId);
    const channel: IDunningChannelConfig = (rule?.autocharge as any) || { retries: [] };

    const lastInvoiceId = subscription.generatedInvoiceIds?.[subscription.generatedInvoiceIds.length - 1];
    const gateway = getPaymentGatewayService();
    const result = await gateway.attemptAutocharge(String(lastInvoiceId || subscription._id), subscription.totalAmount);

    if (result.success) {
      await onPaymentSuccess(tenantId, String(subscription._id));
    } else {
      const nextIndex = subscription.dunningRetryCount + 1;
      const nextRetry = channel.retries?.[nextIndex];
      if (nextRetry) {
        subscription.dunningRetryCount = nextIndex;
        subscription.nextDunningRetryAt = addDays(now, nextRetry.afterDays);
        await subscription.save();
        if (rule) await sendDunningEmail(tenantId, String(rule._id), "retry", subscription);
      } else {
        subscription.nextDunningRetryAt = undefined;
        await applyFinalActions(tenantId, subscription, channel);
      }
    }
    processed++;
  }

  return { processed };
}

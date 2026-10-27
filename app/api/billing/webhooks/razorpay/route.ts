import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import BillingWebhookEvent from "@/models/billing/BillingWebhookEvent";
import BillingPayment, {
  BILLING_PAYMENT_STATUS,
  BILLING_PAYMENT_TYPE,
} from "@/models/billing/BillingPayment";
import { razorpayService } from "@/lib/billing/razorpayClient";
import { subscriptionManager } from "@/lib/billing/subscriptionManager";
import BillingRefund from "@/models/billing/BillingRefund";
import { settleRefundOperation } from "@/lib/billing/refundManager";
import SaaSSubscription from "@/models/billing/SaaSSubscription";
import Organization from "@/models/admin/Organization";
import { generateBillingInvoice } from "@/lib/billing/invoiceGenerator";
import { enqueueBillingNotification } from "@/lib/billing/notifications";
import { invalidateEntitlementsCache } from "@/lib/platform/entitlements/resolve";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import { ORGANIZATION_TIER, SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";
import { calculateRenewalTax } from "@/lib/billing/renewalPricing";

export async function POST(req: NextRequest) {
  let webhookEvent: any;
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    // Authenticate signature
    if (!razorpayService.verifyWebhookSignature(rawBody, signature)) {
      return NextResponse.json(
        { success: false, error: "Invalid webhook signature" },
        { status: 400 }
      );
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON payload" },
        { status: 400 }
      );
    }

    const eventId =
      req.headers.get("x-razorpay-event-id") || payload?.event_id || payload?.id;
    const eventType = payload?.event;
    if (typeof eventId !== "string" || !eventId || typeof eventType !== "string" || !eventType) {
      return NextResponse.json(
        { success: false, error: "Webhook event ID and type are required." },
        { status: 400 }
      );
    }

    await connectDB();

    const paymentEntity = payload?.payload?.payment?.entity;
    const subscriptionEntity = payload?.payload?.subscription?.entity;
    const notes = paymentEntity?.notes || subscriptionEntity?.notes || {};
    const tenantId = typeof notes.tenantId === "string" ? notes.tenantId : undefined;

    // Claim each provider event once. A processing event is retried after a
    // short lease if the previous worker crashed before finishing.
    const existing = await BillingWebhookEvent.findOne({ eventId });
    if (existing?.processed) {
      return NextResponse.json(
        { success: true, message: "Event already acknowledged." },
        { status: 200 }
      );
    }
    if (existing) {
      const leaseExpired = !existing.processingAt ||
        existing.processingAt.getTime() < Date.now() - 5 * 60 * 1000;
      if (existing.status === "processing" && !leaseExpired) {
        return NextResponse.json(
          { success: false, error: "Webhook event is already being processed." },
          { status: 409 }
        );
      }
      webhookEvent = await BillingWebhookEvent.findOneAndUpdate(
        {
          _id: existing._id,
          status: existing.status,
          updatedAt: existing.updatedAt,
        },
        {
          $set: { status: "processing", processed: false, processingAt: new Date(), error: undefined },
        },
        { new: true }
      );
      if (!webhookEvent) {
        return NextResponse.json(
          { success: false, error: "Webhook event is already being processed." },
          { status: 409 }
        );
      }
    } else {
      try {
        webhookEvent = await BillingWebhookEvent.create({
          eventId,
          eventType,
          tenantId,
          payload,
          processed: false,
          status: "processing",
          processingAt: new Date(),
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          return NextResponse.json(
            { success: false, error: "Webhook event is already being processed." },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    switch (eventType) {
      case "payment.captured":
      case "order.paid": {
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;
        if (!orderId || !paymentId || paymentEntity?.status !== "captured") {
          throw new Error("Captured-payment webhook is missing a valid order/payment reference or captured state.");
        }
        const payment = await BillingPayment.findOne({ razorpayOrderId: orderId });
        if (!payment) throw new Error("Captured-payment webhook does not match a billing order.");
        if (
          paymentEntity.amount !== Math.round(payment.amount * 100) ||
          String(paymentEntity.currency).toUpperCase() !== payment.currency.toUpperCase()
        ) {
          throw new Error("Captured-payment webhook amount or currency does not match the billing order.");
        }
        if (payment.type === BILLING_PAYMENT_TYPE.UPGRADE) {
          await subscriptionManager.applyWebhookVerifiedUpgrade({
            tenantId: payment.tenantId,
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            amountInPaise: paymentEntity.amount,
            currency: paymentEntity.currency,
            providerStatus: paymentEntity.status,
          });
        } else if (payment.status === BILLING_PAYMENT_STATUS.PENDING) {
          payment.status = BILLING_PAYMENT_STATUS.SUCCESSFUL;
          payment.razorpayPaymentId = paymentId;
          await payment.save();
        }
        break;
      }

      case "subscription.authenticated":
      case "subscription.activated":
      case "subscription.pending":
      case "subscription.halted":
      case "subscription.cancelled":
      case "subscription.completed":
      case "subscription.paused":
      case "subscription.resumed": {
        const providerId = subscriptionEntity?.id;
        if (!providerId) throw new Error("Subscription webhook has no provider subscription ID.");
        const local = await SaaSSubscription.findOne({ razorpaySubscriptionId: providerId });
        if (!local) throw new Error("Subscription webhook does not match a billing authorization.");
        const provider = await razorpayService.fetchSubscription(providerId);
        if (provider.id !== providerId) throw new Error("Provider subscription verification mismatch.");
        if ((provider.notes?.billingSubscriptionId && provider.notes.billingSubscriptionId !== String(local._id)) ||
            (provider.notes?.tenantId && provider.notes.tenantId !== local.tenantId)) {
          throw new Error("Provider subscription tenant binding does not match the local record.");
        }
        local.razorpayCustomerId = provider.customer_id || local.razorpayCustomerId;
        if (["authenticated", "active"].includes(provider.status) && !provider.has_scheduled_changes) {
          local.autoPay.enabled = true;
          local.autoPay.status = "active";
        } else if (["cancelled", "completed", "expired"].includes(provider.status) || provider.has_scheduled_changes) {
          local.autoPay.enabled = false;
          local.autoPay.status = "cancelled";
        } else if (["pending", "halted"].includes(provider.status)) {
          local.autoPay.enabled = false;
          local.autoPay.status = "failed";
        }
        await local.save();
        if (eventType === "subscription.pending" || eventType === "subscription.halted") {
          await subscriptionManager.handlePaymentFailure({
            tenantId: local.tenantId,
            reason: eventType === "subscription.halted" ? "Razorpay exhausted its renewal retries." : "Razorpay renewal payment is pending after a failed attempt.",
            providerEventId: eventId,
          });
        }
        break;
      }

      case "subscription.charged": {
        const providerSubscriptionId = subscriptionEntity?.id;
        const eventPayment = payload?.payload?.payment?.entity;
        if (!providerSubscriptionId || !eventPayment?.id) throw new Error("Subscription charge event is missing provider references.");
        const localSubscription = await SaaSSubscription.findOne({ razorpaySubscriptionId: providerSubscriptionId });
        if (!localSubscription || !localSubscription.autoPay.enabled) throw new Error("Charge event does not match an authorized local subscription.");
        const [providerSubscription, providerPayment] = await Promise.all([
          razorpayService.fetchSubscription(providerSubscriptionId),
          razorpayService.fetchPayment(eventPayment.id),
        ]);
        if (providerSubscription.id !== providerSubscriptionId || providerSubscription.status !== "active" ||
            providerPayment.id !== eventPayment.id || providerPayment.status !== "captured" ||
            providerPayment.amount !== eventPayment.amount || providerPayment.currency.toUpperCase() !== eventPayment.currency?.toUpperCase()) {
          throw new Error("Provider renewal payment or subscription state is not verified.");
        }
        if ((providerSubscription.notes?.billingSubscriptionId && providerSubscription.notes.billingSubscriptionId !== String(localSubscription._id)) ||
            (providerSubscription.notes?.tenantId && providerSubscription.notes.tenantId !== localSubscription.tenantId)) {
          throw new Error("Provider renewal tenant binding does not match the local record.");
        }
        const expectedPlanId = (() => {
          try {
            const mappings = JSON.parse(process.env.RAZORPAY_SUBSCRIPTION_PLAN_IDS_JSON || "{}");
            return mappings?.[`${localSubscription.planKey}:${localSubscription.billingCycle}`];
          } catch { return undefined; }
        })();
        const totalCount = Number(process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT);
        if (!expectedPlanId || providerSubscription.plan_id !== expectedPlanId || providerSubscription.total_count !== totalCount) {
          throw new Error("Provider renewal no longer matches its approved plan/cycle configuration.");
        }
        const start = providerSubscription.current_start ? new Date(providerSubscription.current_start * 1000) : null;
        const end = providerSubscription.current_end ? new Date(providerSubscription.current_end * 1000) : null;
        if (!start || !end || end <= start || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
          throw new Error("Provider renewal period is invalid.");
        }

        const paymentIdempotencyKey = `razorpay_renewal_${eventPayment.id}`;
        let renewal = await BillingPayment.findOne({ razorpayPaymentId: eventPayment.id });
        if (!renewal) {
          const org = await Organization.findOne({ subdomain: localSubscription.tenantId });
          const tax = calculateRenewalTax(localSubscription.currentPrice, org?.settings?.state);
          renewal = await BillingPayment.findOneAndUpdate(
            { idempotencyKey: paymentIdempotencyKey },
            { $setOnInsert: {
              tenantId: localSubscription.tenantId,
              organizationId: org?._id,
              subscriptionId: localSubscription._id,
              type: BILLING_PAYMENT_TYPE.RENEWAL,
              amount: providerPayment.amount / 100,
              currency: providerPayment.currency,
              status: BILLING_PAYMENT_STATUS.PENDING,
              billingCycle: localSubscription.billingCycle,
              razorpayPaymentId: providerPayment.id,
              taxBreakup: {
                taxableAmount: tax.taxableAmount,
                cgst: tax.cgst,
                sgst: tax.sgst,
                igst: tax.igst,
                totalTax: tax.totalTax,
                isInterState: tax.isInterState,
              },
              idempotencyKey: paymentIdempotencyKey,
            } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          );
        }
        const taxableAmount = renewal.taxBreakup.taxableAmount;
        const taxTotal = renewal.taxBreakup.totalTax;
        if (renewal.tenantId !== localSubscription.tenantId || renewal.subscriptionId?.toString() !== localSubscription._id.toString() ||
            renewal.type !== BILLING_PAYMENT_TYPE.RENEWAL || renewal.amount * 100 !== providerPayment.amount ||
            renewal.currency.toUpperCase() !== providerPayment.currency.toUpperCase() ||
            Math.round((taxableAmount + taxTotal) * 100) !== providerPayment.amount) {
          throw new Error("Captured renewal does not match the expected tenant, amount, tax, or currency.");
        }
        if (renewal.status !== BILLING_PAYMENT_STATUS.SUCCESSFUL) {
          renewal.status = BILLING_PAYMENT_STATUS.SUCCESSFUL;
          renewal.paymentMethod = eventPayment.method;
          await renewal.save();
        }
        const alreadyApplied = localSubscription.lastPaymentId === providerPayment.id;
        if (!alreadyApplied) {
          localSubscription.currentPeriodStart = start;
          localSubscription.currentPeriodEnd = end;
          localSubscription.paidThroughDate = end;
          localSubscription.nextRenewalDate = end;
          localSubscription.status = "active";
          localSubscription.gracePeriod.isInGrace = false;
          localSubscription.gracePeriod.failedAttemptsCount = 0;
          localSubscription.lastPaymentId = providerPayment.id;
          await localSubscription.save();
          await Organization.updateOne({ subdomain: localSubscription.tenantId }, { $set: { subscriptionStatus: "active" } });
          invalidateEntitlementsCache(localSubscription.tenantId);
        }
        const invoice = await generateBillingInvoice({ payment: renewal, subscription: localSubscription });
        await appendSubscriptionEvent({
          tenantId: localSubscription.tenantId,
          externalEventId: `razorpay-renewal:${providerPayment.id}`,
          type: SUBSCRIPTION_EVENT_TYPE.RENEWED,
          tier: ORGANIZATION_TIER.STARTER,
          amount: renewal.amount,
          currency: renewal.currency,
          meta: { paymentId: renewal._id, invoiceNumber: invoice.invoiceNumber, razorpayPaymentId: providerPayment.id },
        });
        await enqueueBillingNotification({
          tenantId: localSubscription.tenantId,
          idempotencyKey: `billing-renewal:${providerPayment.id}`,
          eventType: "renewal_success",
          subject: "Your Aupulens subscription renewed",
          body: `Your subscription renewed successfully. Invoice ${invoice.invoiceNumber} is available in your billing portal.`,
        });
        break;
      }

      case "payment.failed": {
        if (tenantId) {
          const reason =
            paymentEntity?.error_description ||
            paymentEntity?.error_reason ||
            "Recurring payment failed";
          await subscriptionManager.handlePaymentFailure({
            tenantId,
            reason,
            providerEventId: eventId,
          });
        }
        break;
      }

      case "refund.created":
      case "refund.processed":
      case "refund.failed": {
        const refundEntity = payload?.payload?.refund?.entity;
        if (!refundEntity?.id || !refundEntity.payment_id || !Number.isInteger(refundEntity.amount)) {
          throw new Error("Refund webhook is missing a valid provider refund reference.");
        }
        const operation = refundEntity.notes?.billing_refund_id
          ? await BillingRefund.findById(refundEntity.notes.billing_refund_id)
          : await BillingRefund.findOne({ providerRefundId: refundEntity.id });
        if (!operation) throw new Error("Refund webhook does not match a reserved billing refund operation.");
        const providerRefund = {
          id: refundEntity.id,
          entity: "refund" as const,
          amount: refundEntity.amount,
          currency: refundEntity.currency,
          payment_id: refundEntity.payment_id,
          status: eventType === "refund.failed" ? "failed" as const :
            eventType === "refund.processed" ? "processed" as const : "created" as const,
          created_at: Number(refundEntity.created_at || Math.floor(Date.now() / 1000)),
          notes: refundEntity.notes,
        };
        await settleRefundOperation(String(operation._id), providerRefund, refundEntity.notes?.reason);
        break;
      }

      default:
        // Ignore unhandled event safely
        break;
    }

    webhookEvent.processed = true;
    webhookEvent.processedAt = new Date();
    if (webhookEvent.status !== "ignored") {
      webhookEvent.status = "processed";
      webhookEvent.error = undefined;
    }
    await webhookEvent.save();

    return NextResponse.json({ status: "ok", eventId }, { status: 200 });
  } catch (error: any) {
    if (webhookEvent) {
      webhookEvent.status = "failed";
      webhookEvent.processed = false;
      webhookEvent.error = "Webhook processing failed; provider retry is required.";
      await webhookEvent.save().catch(() => undefined);
    }
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}

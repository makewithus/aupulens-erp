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

export async function POST(req: NextRequest) {
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

    const eventId = payload?.event_id || payload?.id || `evt_${Date.now()}`;
    const eventType = payload?.event || "unknown";

    await connectDB();

    // Idempotency check: prevent duplicate execution of redelivered events
    const existing = await BillingWebhookEvent.findOne({ eventId });
    if (existing && existing.processed) {
      return NextResponse.json(
        { success: true, message: "Event already acknowledged." },
        { status: 200 }
      );
    }

    const webhookEvent =
      existing ||
      (await BillingWebhookEvent.create({
        eventId,
        eventType,
        payload,
        processed: false,
      }));

    // Process event types
    const paymentEntity = payload?.payload?.payment?.entity;
    const subscriptionEntity = payload?.payload?.subscription?.entity;
    const notes = paymentEntity?.notes || subscriptionEntity?.notes || {};
    const tenantId = notes.tenantId;

    if (tenantId) {
      webhookEvent.tenantId = tenantId;
    }

    switch (eventType) {
      case "payment.captured":
      case "order.paid": {
        const orderId = paymentEntity?.order_id;
        const paymentId = paymentEntity?.id;
        if (orderId) {
          const payment = await BillingPayment.findOne({ razorpayOrderId: orderId });
          if (payment && payment.status !== BILLING_PAYMENT_STATUS.SUCCESSFUL) {
            // Apply upgrade or payment
            if (payment.type === BILLING_PAYMENT_TYPE.UPGRADE) {
              const testSig = razorpayService.generateTestSignature(orderId, paymentId);
              await subscriptionManager.verifyAndApplyUpgrade({
                tenantId: payment.tenantId,
                paymentId: String(payment._id),
                razorpayOrderId: orderId,
                razorpayPaymentId: paymentId,
                razorpaySignature: testSig,
              });
            } else {
              payment.status = BILLING_PAYMENT_STATUS.SUCCESSFUL;
              payment.razorpayPaymentId = paymentId;
              await payment.save();
            }
          }
        }
        break;
      }

      case "subscription.charged": {
        if (tenantId) {
          const amount = (paymentEntity?.amount || 0) / 100;
          const sub = await subscriptionManager.getOrCreateSubscription(tenantId);
          // Rollover / renewal period
          const nextEnd = new Date(sub.nextRenewalDate);
          nextEnd.setMonth(nextEnd.getMonth() + 1);
          sub.currentPeriodStart = sub.nextRenewalDate;
          sub.currentPeriodEnd = nextEnd;
          sub.paidThroughDate = nextEnd;
          sub.nextRenewalDate = nextEnd;
          sub.gracePeriod.isInGrace = false;
          await sub.save();
        }
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
          });
        }
        break;
      }

      case "refund.processed": {
        const refundEntity = payload?.payload?.refund?.entity;
        const paymentId = refundEntity?.payment_id;
        if (paymentId) {
          const payment = await BillingPayment.findOne({ razorpayPaymentId: paymentId });
          if (payment) {
            payment.status = BILLING_PAYMENT_STATUS.REFUNDED;
            payment.refund = {
              refundId: refundEntity.id || `ref_${Date.now()}`,
              amount: (refundEntity.amount || 0) / 100,
              reason: refundEntity.notes?.reason || "Customer refund processed",
              refundedAt: new Date(),
              status: "processed",
              razorpayRefundId: refundEntity.id,
            };
            await payment.save();
          }
        }
        break;
      }

      default:
        // Ignore unhandled event safely
        break;
    }

    webhookEvent.processed = true;
    webhookEvent.processedAt = new Date();
    webhookEvent.status = "processed";
    await webhookEvent.save();

    return NextResponse.json({ status: "ok", eventId }, { status: 200 });
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}

import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import BillingPayment, { BILLING_PAYMENT_STATUS } from "@/models/billing/BillingPayment";
import BillingInvoice from "@/models/billing/BillingInvoice";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import { SUBSCRIPTION_EVENT_TYPE, ORGANIZATION_TIER } from "@/lib/constants/statuses";

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyGlobalAdmin(req);
    if (!authResult.isAuthorized) {
      return NextResponse.json(
        { success: false, error: authResult.message },
        { status: authResult.errorStatus || 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { paymentId, amount, reason } = body;

    if (!paymentId || !reason) {
      return NextResponse.json(
        { success: false, error: "paymentId and reason are required." },
        { status: 400 }
      );
    }

    await connectDB();
    let payment =
      mongoose.Types.ObjectId.isValid(paymentId) && /^[0-9a-fA-F]{24}$/.test(paymentId)
        ? await BillingPayment.findById(paymentId)
        : null;

    if (!payment) {
      payment = await BillingPayment.findOne({
        $or: [
          { razorpayPaymentId: paymentId },
          { subscriptionId: paymentId },
        ],
      }).sort({ createdAt: -1 });
    }

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Payment record not found." },
        { status: 404 }
      );
    }

    if (payment.status === BILLING_PAYMENT_STATUS.REFUNDED) {
      return NextResponse.json(
        { success: false, error: "Payment has already been refunded." },
        { status: 400 }
      );
    }

    const refundAmount = typeof amount === "number" && amount > 0 ? amount : payment.amount;
    const refundId = `ref_${Date.now()}`;

    payment.status = BILLING_PAYMENT_STATUS.REFUNDED;
    payment.refund = {
      refundId,
      amount: refundAmount,
      reason,
      refundedAt: new Date(),
      status: "processed",
    };
    await payment.save();

    // Traceable adjustment on associated invoice
    if (payment.invoiceId) {
      await BillingInvoice.findOneAndUpdate(
        { invoiceNumber: payment.invoiceId },
        {
          $set: {
            status: "refunded",
            notes: `Refund of ${payment.currency} ${refundAmount} issued. Reason: ${reason}`,
          },
        }
      );
    }

    await appendSubscriptionEvent({
      tenantId: payment.tenantId,
      type: SUBSCRIPTION_EVENT_TYPE.PAYMENT_FAILED,
      tier: ORGANIZATION_TIER.STARTER,
      amount: refundAmount,
      currency: payment.currency,
      meta: {
        action: "refund_processed",
        paymentId: payment._id,
        refundId,
        reason,
        adminActor: authResult.actor?.email || authResult.actor?.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Refund of ${payment.currency} ${refundAmount} processed successfully.`,
      data: {
        paymentId: payment._id,
        refundId,
        refundAmount,
      },
    });
  } catch (error: any) {
    console.error("Refund error:", error);
    return NextResponse.json(
      { success: false, error: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import mongoose from "mongoose";
import BillingPayment, { BILLING_PAYMENT_STATUS } from "@/models/billing/BillingPayment";
import BillingRefund from "@/models/billing/BillingRefund";
import BillingCreditNote from "@/models/billing/BillingCreditNote";
import { verifyGlobalAdmin } from "@/lib/billing/adminAuth";
import { razorpayService } from "@/lib/billing/razorpayClient";
import { reconcilePendingRefunds, reserveRefund, settleRefundOperation } from "@/lib/billing/refundManager";

function responseFor(refund: any, creditNote?: any) {
  const complete = refund.status === "processed";
  const creditNotePending = complete && !creditNote;
  return NextResponse.json(
    {
      success: complete || refund.status === "pending",
      message: creditNotePending
        ? `Refund of ${refund.currency} ${(refund.amountPaise / 100).toFixed(2)} is provider-confirmed; credit-note issuance is pending reconciliation.`
        : complete
        ? `Refund of ${refund.currency} ${(refund.amountPaise / 100).toFixed(2)} processed.`
        : refund.status === "pending"
          ? "Refund request is pending provider confirmation. It will be reconciled before another refund can be submitted."
          : "Refund request was not processed.",
      data: {
        refundId: refund.providerRefundId || String(refund._id),
        refundStatus: refund.status,
        amount: refund.amountPaise / 100,
        currency: refund.currency,
        creditNoteNumber: creditNote?.creditNoteNumber,
        creditNoteStatus: creditNote ? "issued" : creditNotePending ? "pending" : undefined,
      },
      ...(refund.status === "failed" ? { error: "Provider declined the refund request." } : {}),
    },
    { status: complete && !creditNotePending ? 200 : (complete || refund.status === "pending") ? 202 : 409 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyGlobalAdmin(req);
    if (!authResult.isAuthorized) {
      return NextResponse.json({ success: false, error: authResult.message }, { status: authResult.errorStatus || 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { paymentId, amount, reason } = body;
    const idempotencyKey = req.headers.get("idempotency-key") || body.idempotencyKey;
    if (typeof paymentId !== "string" || !paymentId || typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json({ success: false, error: "paymentId and reason are required." }, { status: 400 });
    }
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });
    }

    await connectDB();
    let payment = mongoose.Types.ObjectId.isValid(paymentId) && /^[0-9a-fA-F]{24}$/.test(paymentId)
      ? await BillingPayment.findById(paymentId)
      : null;
    if (!payment) {
      payment = await BillingPayment.findOne({ razorpayPaymentId: paymentId }).sort({ createdAt: -1 });
    }
    if (!payment) return NextResponse.json({ success: false, error: "Payment record not found." }, { status: 404 });

    let priorRefund = await BillingRefund.findOne({ idempotencyKey });
    if (priorRefund) {
      const sameRequest = String(priorRefund.paymentRecordId) === String(payment._id) &&
        priorRefund.amountPaise === Math.round((amount === undefined ? payment.amount : amount) * 100) &&
        priorRefund.reason === reason.trim().slice(0, 256);
      if (!sameRequest) return NextResponse.json({ success: false, error: "Idempotency key was used for a different refund request." }, { status: 409 });
      if (priorRefund.status === "pending") {
        await reconcilePendingRefunds(100, payment._id);
        priorRefund = await BillingRefund.findById(priorRefund._id) || priorRefund;
      }
      const creditNote = priorRefund.creditNoteId ? await BillingCreditNote.findById(priorRefund.creditNoteId) : undefined;
      return responseFor(priorRefund, creditNote);
    }
    if (payment.status !== BILLING_PAYMENT_STATUS.SUCCESSFUL || !payment.razorpayPaymentId) {
      return NextResponse.json({ success: false, error: "Only successfully captured Razorpay payments can be refunded." }, { status: 409 });
    }

    const refundAmount = amount === undefined ? payment.amount : amount;
    if (typeof refundAmount !== "number" || !Number.isFinite(refundAmount) ||
        Math.round(refundAmount * 100) !== refundAmount * 100 || refundAmount <= 0) {
      return NextResponse.json({ success: false, error: "Refund amount must be a positive value with at most two decimal places." }, { status: 400 });
    }
    if (!razorpayService.isConfigured()) {
      return NextResponse.json({ success: false, error: "Razorpay is not configured; no refund was submitted." }, { status: 503 });
    }

    const unresolvedRefund = await BillingRefund.findOne({
      paymentRecordId: payment._id,
      status: { $in: ["reserving", "pending"] },
    }).sort({ createdAt: 1 });
    if (unresolvedRefund?.status === "pending") {
      await reconcilePendingRefunds(100, payment._id);
    }
    const stillUnresolved = unresolvedRefund
      ? await BillingRefund.findOne({ _id: unresolvedRefund._id, status: { $in: ["reserving", "pending"] } })
      : null;
    if (stillUnresolved) {
      const creditNote = stillUnresolved.creditNoteId
        ? await BillingCreditNote.findById(stillUnresolved.creditNoteId)
        : undefined;
      return responseFor(stillUnresolved, creditNote);
    }

    let reservation;
    try {
      reservation = await reserveRefund({
        payment,
        amountPaise: Math.round(refundAmount * 100),
        reason: reason.trim().slice(0, 256),
        idempotencyKey,
      });
    } catch (error: any) {
      if (error?.code === 11000) {
        const existing = await BillingRefund.findOne({ idempotencyKey });
        if (existing) {
          const creditNote = existing.creditNoteId ? await BillingCreditNote.findById(existing.creditNoteId) : undefined;
          return responseFor(existing, creditNote);
        }
      }
      const message = error instanceof Error ? error.message : "Refund could not be reserved.";
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    if (reservation.replay) {
      const creditNote = reservation.refund.creditNoteId
        ? await BillingCreditNote.findById(reservation.refund.creditNoteId)
        : undefined;
      return responseFor(reservation.refund, creditNote);
    }

    try {
      const providerRefund = await razorpayService.createRefund({
        paymentId: payment.razorpayPaymentId,
        amount: refundAmount,
        currency: payment.currency,
        reason: reason.trim().slice(0, 256),
        refundRequestId: String(reservation.refund._id),
      });
      const settled = await settleRefundOperation(String(reservation.refund._id), providerRefund);
      const creditNote = settled?.creditNoteId ? await BillingCreditNote.findById(settled.creditNoteId) : undefined;
      return responseFor(settled, creditNote);
    } catch {
      console.error("Razorpay refund request or reconciliation failed; reserved refund requires reconciliation.");
      const latest = await BillingRefund.findById(reservation.refund._id).catch(() => null);
      if (latest) {
        const creditNote = latest.creditNoteId ? await BillingCreditNote.findById(latest.creditNoteId).catch(() => null) : undefined;
        return responseFor(latest, creditNote || undefined);
      }
      return NextResponse.json(
        { success: false, error: "Refund outcome is not confirmed. The request remains reserved for provider reconciliation; do not resubmit yet.", data: { refundId: String(reservation.refund._id), refundStatus: "pending" } },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json({ success: false, error: "Refund operation failed." }, { status: 500 });
  }
}

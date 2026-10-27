import mongoose from "mongoose";
import BillingPayment, { BILLING_PAYMENT_STATUS } from "@/models/billing/BillingPayment";
import BillingRefund, { type IBillingRefund } from "@/models/billing/BillingRefund";
import { issueCreditNoteForRefund } from "@/lib/billing/creditNotes";
import { razorpayService, type RazorpayRefundResponse } from "@/lib/billing/razorpayClient";
import { appendSubscriptionEvent } from "@/lib/billing/appendSubscriptionEvent";
import { ORGANIZATION_TIER, SUBSCRIPTION_EVENT_TYPE } from "@/lib/constants/statuses";
import { enqueueBillingNotification } from "@/lib/billing/notifications";

async function finalizeProcessedRefund(refundId: string) {
  const refund = await BillingRefund.findById(refundId);
  if (!refund || refund.status !== "processed") return refund;
  const creditNote = await issueCreditNoteForRefund(String(refund._id));
  await BillingRefund.updateOne({ _id: refund._id, creditNoteId: { $exists: false } }, { $set: { creditNoteId: creditNote._id } });
  await appendSubscriptionEvent({
    tenantId: refund.tenantId,
    type: SUBSCRIPTION_EVENT_TYPE.REFUNDED,
    tier: ORGANIZATION_TIER.STARTER,
    amount: refund.amountPaise / 100,
    currency: refund.currency,
    externalEventId: `refund:${refund.providerRefundId}`,
    meta: { action: "refund_processed", paymentId: refund.paymentRecordId, refundId: refund.providerRefundId, creditNoteNumber: creditNote.creditNoteNumber },
  });
  await enqueueBillingNotification({
    tenantId: refund.tenantId,
    idempotencyKey: `billing-refund:${refund._id}`,
    eventType: "refund_processed",
    subject: "Your Aupulens refund was processed",
    body: `A refund of ${refund.currency} ${(refund.amountPaise / 100).toFixed(2)} was processed. Credit note ${creditNote.creditNoteNumber} is available in your billing portal.`,
  });
  return BillingRefund.findById(refund._id);
}

export async function reserveRefund(params: {
  payment: InstanceType<typeof BillingPayment>;
  amountPaise: number;
  reason: string;
  idempotencyKey: string;
}) {
  const existing = await BillingRefund.findOne({ idempotencyKey: params.idempotencyKey });
  if (existing) {
    const sameRequest = String(existing.paymentRecordId) === String(params.payment._id) &&
      existing.amountPaise === params.amountPaise && existing.reason === params.reason;
    if (!sameRequest) throw new Error("Idempotency key was already used for a different refund request.");
    return { refund: existing, replay: true };
  }

  const refund = await BillingRefund.create({
    tenantId: params.payment.tenantId,
    paymentRecordId: params.payment._id,
    providerPaymentId: params.payment.razorpayPaymentId,
    idempotencyKey: params.idempotencyKey,
    amountPaise: params.amountPaise,
    currency: params.payment.currency,
    reason: params.reason,
    status: "reserving",
  });

  const previousRefunds = await BillingRefund.aggregate([
    { $match: { paymentRecordId: params.payment._id, status: "processed", _id: { $ne: refund._id } } },
    { $group: { _id: null, totalPaise: { $sum: "$amountPaise" } } },
  ]);
  const processedPaise = Number(previousRefunds[0]?.totalPaise || 0);
  const legacyProcessedPaise = params.payment.refund?.status === "processed" &&
    !await BillingRefund.exists({ providerRefundId: params.payment.refund.razorpayRefundId })
      ? Math.round(params.payment.refund.amount * 100)
      : 0;
  const storedProcessedPaise = Number(params.payment.refundedAmountPaise || 0);
  const completedPaise = Math.max(processedPaise, legacyProcessedPaise);
  const legacyOffsetPaise = Math.max(0, completedPaise - storedProcessedPaise);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const reserved = await BillingPayment.findOneAndUpdate(
        {
          _id: params.payment._id,
          status: BILLING_PAYMENT_STATUS.SUCCESSFUL,
          $expr: {
            $lte: [
              { $add: [
                { $ifNull: ["$refundReservedAmountPaise", 0] },
                { $ifNull: ["$refundedAmountPaise", 0] },
                legacyOffsetPaise,
                params.amountPaise,
              ] },
              { $round: [{ $multiply: ["$amount", 100] }, 0] },
            ],
          },
        },
        [{
          $set: {
            refundReservedAmountPaise: {
              $add: [{ $ifNull: ["$refundReservedAmountPaise", 0] }, params.amountPaise],
            },
          },
        }],
        { new: true, session }
      );
      if (!reserved) throw new Error("Payment is no longer eligible for refund.");
      await BillingRefund.updateOne({ _id: refund._id, status: "reserving" }, { $set: { status: "pending" } }, { session });
    });
  } catch (error) {
    await BillingRefund.deleteOne({ _id: refund._id, status: "reserving" }).catch(() => undefined);
    throw error;
  } finally {
    await session.endSession();
  }
  return { refund: await BillingRefund.findById(refund._id) as IBillingRefund, replay: false };
}

export async function settleRefundOperation(
  refundId: string,
  providerRefund: RazorpayRefundResponse,
  reason?: string
) {
  const refund = await BillingRefund.findById(refundId);
  if (!refund) throw new Error("Refund operation was not found.");
  if (refund.status === "processed") return finalizeProcessedRefund(String(refund._id));
  if (refund.status === "failed") return refund;
  if (providerRefund.payment_id !== refund.providerPaymentId ||
      providerRefund.amount !== refund.amountPaise ||
      providerRefund.currency.toUpperCase() !== refund.currency.toUpperCase()) {
    throw new Error("Provider refund does not match the reserved operation.");
  }

  const terminalStatus = providerRefund.status === "processed" ? "processed" :
    providerRefund.status === "failed" ? "failed" : "pending";
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await BillingRefund.findOneAndUpdate(
        { _id: refund._id, status: { $in: ["pending", "reserving"] } },
        {
          $set: {
            status: terminalStatus,
            providerRefundId: providerRefund.id,
            providerCreatedAt: new Date(providerRefund.created_at * 1000),
            lastError: undefined,
          },
        },
        { new: true, session }
      );
      if (!claimed) return;
      if (terminalStatus !== "pending") {
        const paymentUpdate: Record<string, unknown> = {
          $inc: { refundReservedAmountPaise: -refund.amountPaise },
          $set: {
            refund: {
              refundId: providerRefund.id,
              amount: refund.amountPaise / 100,
              reason: reason || refund.reason,
              refundedAt: new Date(providerRefund.created_at * 1000),
              status: terminalStatus,
              razorpayRefundId: providerRefund.id,
            },
          },
        };
        if (terminalStatus === "processed") {
          (paymentUpdate.$inc as Record<string, number>).refundedAmountPaise = refund.amountPaise;
        }
        const paymentDoc = terminalStatus === "processed"
          ? await BillingPayment.findById(refund.paymentRecordId).session(session)
          : null;
        const processedTotals = terminalStatus === "processed"
          ? await BillingRefund.aggregate([
              { $match: { paymentRecordId: refund.paymentRecordId, status: "processed" } },
              { $group: { _id: null, total: { $sum: "$amountPaise" } } },
            ]).session(session)
          : [];
        if (paymentDoc && Number(processedTotals[0]?.total || 0) >= Math.round(paymentDoc.amount * 100)) {
          (paymentUpdate.$set as Record<string, unknown>).status = BILLING_PAYMENT_STATUS.REFUNDED;
        }
        const changed = await BillingPayment.updateOne(
          { _id: refund.paymentRecordId, refundReservedAmountPaise: { $gte: refund.amountPaise } },
          paymentUpdate,
          { session }
        );
        if (changed.modifiedCount !== 1) throw new Error("Refund balance reservation could not be finalized.");
      }
    });
  } finally {
    await session.endSession();
  }

  const settled = await BillingRefund.findById(refund._id);
  if (settled?.status === "processed") return finalizeProcessedRefund(String(settled._id));
  return settled;
}

export async function reconcilePendingRefunds(limit = 100) {
  const pending = await BillingRefund.find({
    $or: [
      { status: "pending" },
      { status: "processed", creditNoteId: { $exists: false } },
    ],
  }).sort({ updatedAt: 1 }).limit(limit);
  let reconciled = 0;
  for (const refund of pending) {
    try {
      if (refund.status === "processed") {
        await finalizeProcessedRefund(String(refund._id));
        reconciled++;
        continue;
      }
      const providerRefunds = await razorpayService.fetchRefundsForPayment(refund.providerPaymentId);
      const match = providerRefunds.find((item) => item.id === refund.providerRefundId || item.notes?.billing_refund_id === String(refund._id));
      if (match) {
        const before = refund.status;
        await settleRefundOperation(String(refund._id), match);
        if (before !== "pending" || match.status !== "created") reconciled++;
      }
      await BillingRefund.updateOne({ _id: refund._id }, { $set: { reconciledAt: new Date() } });
    } catch {
      await BillingRefund.updateOne({ _id: refund._id }, { $set: { lastError: "Provider reconciliation failed; manual review required." } });
    }
  }
  return { scanned: pending.length, reconciled };
}

import connectDB from "@/lib/db";
import BillingNotification from "@/models/billing/BillingNotification";
import Organization from "@/models/admin/Organization";
import User from "@/models/auth/User";
import { getEmailService } from "@/lib/email/sendEmail";

export async function enqueueBillingNotification(params: {
  tenantId: string;
  idempotencyKey: string;
  eventType: string;
  subject: string;
  body: string;
  recipient?: string;
}) {
  await connectDB();
  let recipient = params.recipient;
  if (!recipient) {
    const organization = await Organization.findOne({ subdomain: params.tenantId }).select("ownerUserId").lean();
    if (!organization?.ownerUserId) return { queued: false, reason: "recipient_unavailable" };
    const owner = await User.findById(organization.ownerUserId).select("email").lean();
    recipient = owner?.email;
  }
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { queued: false, reason: "recipient_unavailable" };
  }
  try {
    const notification = await BillingNotification.findOneAndUpdate(
      { idempotencyKey: params.idempotencyKey },
      {
        $setOnInsert: {
          tenantId: params.tenantId,
          idempotencyKey: params.idempotencyKey,
          eventType: params.eventType,
          recipient,
          subject: params.subject.slice(0, 180),
          body: params.body.slice(0, 8000),
          status: "pending",
          attempts: 0,
          nextAttemptAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return { queued: true, notificationId: String(notification._id) };
  } catch (error: any) {
    if (error?.code === 11000) return { queued: true, duplicate: true };
    throw error;
  }
}

export async function processBillingNotificationQueue(limit = 50) {
  await connectDB();
  const now = new Date();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < limit; i++) {
    const notification = await BillingNotification.findOneAndUpdate(
      {
        nextAttemptAt: { $lte: now },
        $or: [
          { status: "pending" },
          { status: "sending", processingUntil: { $lte: now } },
        ],
      },
      { $set: { status: "sending", processingUntil: new Date(now.getTime() + 10 * 60_000) }, $inc: { attempts: 1 } },
      { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
    );
    if (!notification) break;
    const result = await getEmailService().send({
      to: notification.recipient,
      subject: notification.subject,
      body: notification.body,
    });
    if (result.success) {
      await BillingNotification.updateOne(
        { _id: notification._id, status: "sending" },
        { $set: { status: "sent", sentAt: new Date(), processingUntil: undefined, lastError: undefined } }
      );
      sent++;
      continue;
    }
    const exhausted = notification.attempts >= 5;
    const delayMinutes = Math.min(5 * 2 ** Math.max(0, notification.attempts - 1), 360);
    await BillingNotification.updateOne(
      { _id: notification._id, status: "sending" },
      {
        $set: {
          status: exhausted ? "failed" : "pending",
          nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000),
          processingUntil: undefined,
          lastError: "SMTP delivery failed; see provider configuration and queue retry state.",
        },
      }
    );
    failed++;
  }
  return { sent, failed };
}

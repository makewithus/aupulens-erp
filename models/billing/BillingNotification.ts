import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IBillingNotification extends Document {
  tenantId: string;
  idempotencyKey: string;
  eventType: string;
  recipient: string;
  subject: string;
  body: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  nextAttemptAt: Date;
  processingUntil?: Date;
  sentAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillingNotificationSchema = new Schema<IBillingNotification>(
  {
    tenantId: { type: String, required: true, immutable: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, immutable: true },
    eventType: { type: String, required: true, immutable: true },
    recipient: { type: String, required: true, immutable: true },
    subject: { type: String, required: true, immutable: true },
    body: { type: String, required: true, immutable: true },
    status: { type: String, enum: ["pending", "sending", "sent", "failed"], default: "pending", index: true },
    attempts: { type: Number, min: 0, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    processingUntil: Date,
    sentAt: Date,
    lastError: { type: String, maxlength: 160 },
  },
  { timestamps: true }
);

BillingNotificationSchema.index({ status: 1, nextAttemptAt: 1, processingUntil: 1 });

const BillingNotification: Model<IBillingNotification> =
  (mongoose.models.BillingNotification as Model<IBillingNotification>) ||
  mongoose.model<IBillingNotification>("BillingNotification", BillingNotificationSchema);

export default BillingNotification;

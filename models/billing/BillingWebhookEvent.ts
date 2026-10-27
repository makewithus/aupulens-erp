import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBillingWebhookEvent extends Document {
  eventId: string;
  eventType: string;
  tenantId?: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processedAt?: Date;
  status: "processing" | "processed" | "ignored" | "failed";
  processingAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillingWebhookEventSchema = new Schema<IBillingWebhookEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, index: true },
    tenantId: { type: String, index: true, immutable: true },
    payload: { type: Schema.Types.Mixed, required: true },
    processed: { type: Boolean, default: false },
    processedAt: { type: Date },
    processingAt: { type: Date },
    status: {
      type: String,
      enum: ["processing", "processed", "ignored", "failed"],
      default: "processing",
      index: true,
    },
    error: { type: String },
  },
  { timestamps: true }
);

BillingWebhookEventSchema.index({ eventType: 1, createdAt: -1 });

const BillingWebhookEvent: Model<IBillingWebhookEvent> =
  (mongoose.models.BillingWebhookEvent as Model<IBillingWebhookEvent>) ||
  mongoose.model<IBillingWebhookEvent>("BillingWebhookEvent", BillingWebhookEventSchema);

export default BillingWebhookEvent;

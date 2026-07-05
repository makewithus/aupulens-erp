import mongoose, { Schema, Document, Model } from "mongoose";
import { SUBSCRIPTION_WEBHOOK_EVENT_VALUES } from "@/lib/constants/statuses";

// Settings → Sales → Subscriptions → Webhooks (Sales revamp Part 4.3/4).
export interface ISubscriptionWebhook extends Document {
  tenantId: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionWebhookSchema = new Schema<ISubscriptionWebhook>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    secret: { type: String, required: true },
    events: [{ type: String, enum: SUBSCRIPTION_WEBHOOK_EVENT_VALUES }],
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

SubscriptionWebhookSchema.index({ tenantId: 1 });

const SubscriptionWebhook: Model<ISubscriptionWebhook> =
  (mongoose.models.SubscriptionWebhook as Model<ISubscriptionWebhook>) ||
  mongoose.model<ISubscriptionWebhook>("SubscriptionWebhook", SubscriptionWebhookSchema);

export default SubscriptionWebhook;

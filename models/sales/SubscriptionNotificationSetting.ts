import mongoose, { Schema, Document, Model } from "mongoose";

// Settings → Sales → Subscriptions → Email Notifications (Sales revamp Part
// 4.3). One row per (tenant, eventKey) — enable/disable + which
// EmailTemplate (keyed `notification:<eventKey>`) fires for that event.
export interface ISubscriptionNotificationSetting extends Document {
  tenantId: string;
  eventKey: string;
  label: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionNotificationSettingSchema = new Schema<ISubscriptionNotificationSetting>(
  {
    tenantId: { type: String, required: true },
    eventKey: { type: String, required: true },
    label: { type: String, required: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

SubscriptionNotificationSettingSchema.index({ tenantId: 1, eventKey: 1 }, { unique: true });

const SubscriptionNotificationSetting: Model<ISubscriptionNotificationSetting> =
  (mongoose.models.SubscriptionNotificationSetting as Model<ISubscriptionNotificationSetting>) ||
  mongoose.model<ISubscriptionNotificationSetting>(
    "SubscriptionNotificationSetting",
    SubscriptionNotificationSettingSchema,
  );

export default SubscriptionNotificationSetting;

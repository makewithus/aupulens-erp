import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PLATFORM_ALERT_DELIVERY_CHANNEL_VALUES,
  PLATFORM_ALERT_TYPE_VALUES,
  PLATFORM_SEVERITY_VALUES,
  PlatformAlertDeliveryChannel,
  PlatformAlertType,
  PlatformSeverity,
} from "@/lib/constants/statuses";

/**
 * Source doc §28. `deliveryChannels` records what was REQUESTED; `emailSent`/
 * `webhookSent` record what actually happened. In-app delivery (the alert
 * row itself, surfaced in a platform UI panel) is real. No code path in
 * this codebase ever sets emailSent/webhookSent to true — no platform-level
 * email/webhook sending infrastructure exists yet (docs/admin/
 * OPEN_QUESTIONS.md) — recorded honestly as false rather than a fabricated
 * send. tests/platform/sourceGrep.test.ts checks that structurally, not
 * just by one passing test.
 */
export interface IPlatformAlert extends Document {
  tenantId?: string;
  alertType: PlatformAlertType;
  severity: PlatformSeverity;
  message: string;
  deliveryChannels: PlatformAlertDeliveryChannel[];
  emailSent: boolean;
  webhookSent: boolean;
  triggeredAt: Date;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const PlatformAlertSchema = new Schema<IPlatformAlert>(
  {
    tenantId: { type: String },
    alertType: { type: String, required: true, enum: PLATFORM_ALERT_TYPE_VALUES },
    severity: { type: String, required: true, enum: PLATFORM_SEVERITY_VALUES },
    message: { type: String, required: true },
    deliveryChannels: { type: [String], enum: PLATFORM_ALERT_DELIVERY_CHANNEL_VALUES, default: ["in_app"] },
    emailSent: { type: Boolean, required: true, default: false },
    webhookSent: { type: Boolean, required: true, default: false },
    triggeredAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

PlatformAlertSchema.index({ createdAt: -1 });
PlatformAlertSchema.index({ tenantId: 1, createdAt: -1 });
PlatformAlertSchema.index({ resolvedAt: 1 });

export default (mongoose.models.PlatformAlert as Model<IPlatformAlert>) ||
  mongoose.model<IPlatformAlert>("PlatformAlert", PlatformAlertSchema);

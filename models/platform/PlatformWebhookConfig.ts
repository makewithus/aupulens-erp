import mongoose, { Schema, Document, Model } from "mongoose";
import { PLATFORM_ALERT_TYPE_VALUES, PlatformAlertType } from "@/lib/constants/statuses";

/**
 * Phase 12 Part 0.2 — webhook alert delivery, re-triaged from
 * DECLARED_NOT_POSSIBLE (email/webhook lumped together) to real for webhook
 * specifically: an HTTP POST to a configured URL is buildable with nothing
 * this environment lacks. Email still needs SMTP credentials this
 * environment does not have — left as a configurable adapter interface
 * (`lib/platform/alerts/webhookDelivery.ts`'s own doc comment), not built.
 *
 * One row per alert type that has webhook delivery configured — not a
 * single global URL, since different conditions plausibly go to different
 * receiving systems (a security-severity alert to a SIEM webhook, an AI
 * cost spike to a Slack channel, etc.). Absence of a row for a given
 * `alertType` means "not configured," not an error.
 */
export interface IPlatformWebhookConfig extends Document {
  alertType: PlatformAlertType;
  url: string;
  enabled: boolean;
  // HMAC-SHA256 signing secret for the `X-Aupulens-Signature` header — lets
  // the receiver verify the payload actually came from this platform.
  // Stored in the clear like every other admin-configured value in this
  // codebase (there is no secrets-encryption convention here beyond MFA's
  // own AES-256-GCM, which is a different, credential-specific case) — a
  // receiving system treats it the same way a webhook provider's own
  // signing secret is normally handled.
  secret: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformWebhookConfigSchema = new Schema<IPlatformWebhookConfig>(
  {
    alertType: { type: String, required: true, unique: true, enum: PLATFORM_ALERT_TYPE_VALUES },
    url: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: true },
    secret: { type: String, required: true },
  },
  { timestamps: true },
);

export default (mongoose.models.PlatformWebhookConfig as Model<IPlatformWebhookConfig>) ||
  mongoose.model<IPlatformWebhookConfig>("PlatformWebhookConfig", PlatformWebhookConfigSchema);

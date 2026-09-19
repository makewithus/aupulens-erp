import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Traceable record of what a user typed vs what the model received, kept for support.
 * Written only for non-English or degraded interactions (English short-circuits and writes nothing,
 * so the majority path pays no DB cost). TTL-expired after 90 days.
 */
export interface IAiLanguageInteraction extends Document {
  tenantId: string;
  userId?: string;
  feature?: string;
  trace: Record<string, unknown>;
  detectedLanguage: string;
  degraded: boolean;
  createdAt: Date;
}

const AiLanguageInteractionSchema = new Schema<IAiLanguageInteraction>(
  {
    tenantId: { type: String, required: true },
    userId: { type: String },
    feature: { type: String },
    trace: { type: Schema.Types.Mixed, required: true },
    detectedLanguage: { type: String, required: true },
    degraded: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
AiLanguageInteractionSchema.index({ tenantId: 1, createdAt: -1 });
AiLanguageInteractionSchema.index({ tenantId: 1, detectedLanguage: 1 });
AiLanguageInteractionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export default (mongoose.models.AiLanguageInteraction as Model<IAiLanguageInteraction>) ||
  mongoose.model<IAiLanguageInteraction>("AiLanguageInteraction", AiLanguageInteractionSchema);

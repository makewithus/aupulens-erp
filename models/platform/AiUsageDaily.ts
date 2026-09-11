import mongoose, { Schema, Document, Model } from "mongoose";
import { AI_USAGE_FEATURE_BUCKET_VALUES, AiUsageFeatureBucket } from "@/lib/constants/statuses";

/**
 * Rollup, computed by app/api/cron/platform/ai-usage-rollup — dashboards
 * read this, never AiUsageRecord directly (the brief's own load-time
 * warning: "or the AI Usage dashboard will not meet any sane load time").
 * One document per {tenantId, period, feature}; period = "YYYY-MM-DD" UTC.
 */
export interface IAiUsageDaily extends Document {
  tenantId: string;
  period: string;
  feature: AiUsageFeatureBucket;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  errorCount: number;
  updatedAt: Date;
}

const AiUsageDailySchema = new Schema<IAiUsageDaily>(
  {
    tenantId: { type: String, required: true },
    period: { type: String, required: true },
    feature: { type: String, required: true, enum: AI_USAGE_FEATURE_BUCKET_VALUES },
    requestCount: { type: Number, required: true, default: 0 },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    estimatedCostUsd: { type: Number, required: true, default: 0 },
    errorCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

AiUsageDailySchema.index({ tenantId: 1, period: 1, feature: 1 }, { unique: true });
AiUsageDailySchema.index({ period: 1 });

export default (mongoose.models.AiUsageDaily as Model<IAiUsageDaily>) ||
  mongoose.model<IAiUsageDaily>("AiUsageDaily", AiUsageDailySchema);

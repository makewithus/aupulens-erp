import mongoose, { Schema, Document, Model } from "mongoose";
import { AI_USAGE_FEATURE_BUCKET_VALUES, AiUsageFeatureBucket } from "@/lib/constants/statuses";

/** Same shape as AiUsageDaily, period = "YYYYMM" UTC (matches
 *  lib/ai/usage.ts::getAiPeriod()'s existing format for consistency). */
export interface IAiUsageMonthly extends Document {
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

const AiUsageMonthlySchema = new Schema<IAiUsageMonthly>(
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

AiUsageMonthlySchema.index({ tenantId: 1, period: 1, feature: 1 }, { unique: true });
AiUsageMonthlySchema.index({ period: 1 });

export default (mongoose.models.AiUsageMonthly as Model<IAiUsageMonthly>) ||
  mongoose.model<IAiUsageMonthly>("AiUsageMonthly", AiUsageMonthlySchema);

import mongoose, { Schema, Document, Model } from "mongoose";
import {
  AI_USAGE_FEATURE_BUCKET_VALUES,
  AI_USAGE_REQUEST_STATUS_VALUES,
  AiUsageFeatureBucket,
  AiUsageRequestStatus,
} from "@/lib/constants/statuses";

/**
 * One row per AI request (source doc §12). Written from the single
 * instrumentation point inside lib/ai/tenantAi.ts — never any other call
 * site. Hard Rule 9: NEVER stores prompt or response bodies — token counts
 * and a request ID only.
 */
export interface IAiUsageRecord extends Document {
  tenantId: string;
  feature: AiUsageFeatureBucket;
  // Named modelName, not model — "model" collides with Mongoose Document's
  // own inherited .model() method and breaks the schema's TS types.
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  status: AiUsageRequestStatus;
  requestId: string;
  createdAt: Date;
}

const AiUsageRecordSchema = new Schema<IAiUsageRecord>(
  {
    tenantId: { type: String, required: true },
    feature: { type: String, required: true, enum: AI_USAGE_FEATURE_BUCKET_VALUES },
    modelName: { type: String, required: true },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    estimatedCostUsd: { type: Number, required: true, default: 0 },
    latencyMs: { type: Number, required: true, default: 0 },
    status: { type: String, required: true, enum: AI_USAGE_REQUEST_STATUS_VALUES },
    requestId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiUsageRecordSchema.index({ tenantId: 1, createdAt: -1 });
AiUsageRecordSchema.index({ createdAt: -1 });
AiUsageRecordSchema.index({ tenantId: 1, feature: 1, createdAt: -1 });

export default (mongoose.models.AiUsageRecord as Model<IAiUsageRecord>) ||
  mongoose.model<IAiUsageRecord>("AiUsageRecord", AiUsageRecordSchema);

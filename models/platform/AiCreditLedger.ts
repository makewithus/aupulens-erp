import mongoose, { Schema, Document, Model } from "mongoose";

export type AiCreditEntryStatus = "reserved" | "charged" | "refunded";
export interface IAiCreditLedger extends Document {
  tenantId: string;
  userId?: string;
  planKey?: string;
  period: string;
  requestId: string;
  modelName: string;
  feature: string;
  /** Monthly, session and weekly balance buckets reserved for this request. */
  bucketPeriods?: string[];
  estimatedCredits: number;
  credits: number;
  estimatedCostUsd: number;
  costUsd: number;
  estimatedToolCalls?: number;
  toolCalls?: number;
  estimatedBackendCredits?: number;
  backendCredits?: number;
  inputTokens: number;
  outputTokens: number;
  isEstimated?: boolean;
  status: AiCreditEntryStatus;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
const schema = new Schema<IAiCreditLedger>({
  tenantId: { type: String, required: true },
  userId: { type: String },
  planKey: { type: String },
  period: { type: String, required: true },
  bucketPeriods: { type: [String], default: [] },
  requestId: { type: String, required: true }, modelName: { type: String, required: true }, feature: { type: String, required: true },
  estimatedCredits: { type: Number, required: true, min: 0 }, credits: { type: Number, required: true, min: 0 },
  estimatedCostUsd: { type: Number, required: true, min: 0 }, costUsd: { type: Number, required: true, min: 0 },
  estimatedToolCalls: { type: Number, min: 0, default: 0 }, toolCalls: { type: Number, min: 0, default: 0 },
  estimatedBackendCredits: { type: Number, min: 0, default: 0 }, backendCredits: { type: Number, min: 0, default: 0 },
  inputTokens: { type: Number, required: true, min: 0 }, outputTokens: { type: Number, required: true, min: 0 },
  isEstimated: { type: Boolean, default: false },
  status: { type: String, enum: ["reserved", "charged", "refunded"], required: true },
  completedAt: { type: Date },
}, { timestamps: true });
schema.index({ tenantId: 1, requestId: 1 }, { unique: true });
schema.index({ tenantId: 1, period: 1, status: 1 });
schema.index({ tenantId: 1, createdAt: -1 });
export default (mongoose.models.AiCreditLedger as Model<IAiCreditLedger>) || mongoose.model<IAiCreditLedger>("AiCreditLedger", schema);

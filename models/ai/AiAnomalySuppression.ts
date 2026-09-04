import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-15's suppression record (docs/ai/BRIEF-05-BATCH-D.md A.5) — a user marking an anomaly
 * "expected" suppresses that exact `{detectorId, suppressionKey}` pattern for that scope until
 * `suppressedUntil`. Checked at the START of each detector's evaluation for a given subject —
 * an active suppression means that specific pattern is never even raised again while it holds,
 * not just hidden after the fact.
 */

export interface IAiAnomalySuppression extends Document {
  tenantId: string;
  detectorId: string;
  suppressionKey: string;
  suppressedUntil: Date;
  reason?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AiAnomalySuppressionSchema: Schema<IAiAnomalySuppression> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    detectorId: { type: String, required: true },
    suppressionKey: { type: String, required: true },
    suppressedUntil: { type: Date, required: true },
    reason: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

AiAnomalySuppressionSchema.index({ tenantId: 1, detectorId: 1, suppressionKey: 1 });

const AiAnomalySuppression: Model<IAiAnomalySuppression> =
  (mongoose.models.AiAnomalySuppression as Model<IAiAnomalySuppression>) ||
  mongoose.model<IAiAnomalySuppression>("AiAnomalySuppression", AiAnomalySuppressionSchema);

export default AiAnomalySuppression;

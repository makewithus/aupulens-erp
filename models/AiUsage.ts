import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAiUsage extends Document {
  tenantId: string;
  // Calendar month in UTC: "YYYYMM" (e.g. "202506" for June 2026).
  // Counters roll over when the UTC month changes — each period starts from 0.
  period: string;
  // Number of successful AI call responses in this period for this tenant.
  // Incremented ONLY on success, never on Claude errors or gated requests.
  count: number;
}

const AiUsageSchema: Schema<IAiUsage> = new Schema(
  {
    tenantId: { type: String, required: true },
    period:   { type: String, required: true },
    count:    { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: false }
);

// Primary access pattern: look up by (tenantId, period) → compound unique
AiUsageSchema.index({ tenantId: 1, period: 1 }, { unique: true });
// Secondary index: enables efficient deletion / TTL cleanup of old periods
AiUsageSchema.index({ period: 1 });

const AiUsage: Model<IAiUsage> =
  (mongoose.models?.AiUsage as Model<IAiUsage>) ||
  mongoose.model<IAiUsage>("AiUsage", AiUsageSchema);

export default AiUsage;

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBusinessHealthSummary extends Document {
  tenantId: string;
  period: string; // e.g. "2026-08-07" (day the summary was generated for)
  summary: string;
  highlights: string[];
  concerns: string[];
  revenueForecast?: string;
  metrics: Record<string, unknown>;
  generatedAt: Date;
}

const BusinessHealthSummarySchema = new Schema<IBusinessHealthSummary>(
  {
    tenantId: { type: String, required: true, index: true },
    period: { type: String, required: true },
    summary: { type: String, required: true },
    highlights: [{ type: String }],
    concerns: [{ type: String }],
    revenueForecast: { type: String },
    metrics: { type: Schema.Types.Mixed },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One summary per tenant per period (idempotent re-runs update in place).
BusinessHealthSummarySchema.index({ tenantId: 1, period: 1 }, { unique: true });
BusinessHealthSummarySchema.index({ tenantId: 1, generatedAt: -1 });

export default (mongoose.models.BusinessHealthSummary as Model<IBusinessHealthSummary>) ||
  mongoose.model<IBusinessHealthSummary>("BusinessHealthSummary", BusinessHealthSummarySchema);

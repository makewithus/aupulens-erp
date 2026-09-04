import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-11's persisted findings (docs/ai/BRIEF-08a-BATCH-G.md, AI-11) — one row per
 * `{tenantId, period}`, upserted on every run, same shape as `AiControlResult`/`AiEvidencePack`.
 */

export interface IAiInventoryFinding extends Document {
  tenantId: string;
  period: string;
  accountMapping: { resolved: boolean; accounts: { id: string; code: string; name: string }[]; basis: string };
  subledgerToGl: { qtyValue: number; glValue: number; difference: number; status: string } | null;
  negativeStock: unknown[];
  countVariances: unknown[];
  valuationAnomalies: unknown[];
  slowMoving: unknown[];
  marginAlerts: unknown[];
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiInventoryFindingSchema: Schema<IAiInventoryFinding> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    period: { type: String, required: true },
    accountMapping: { type: Schema.Types.Mixed, default: {} },
    subledgerToGl: { type: Schema.Types.Mixed, default: null },
    negativeStock: { type: [Schema.Types.Mixed], default: [] },
    countVariances: { type: [Schema.Types.Mixed], default: [] },
    valuationAnomalies: { type: [Schema.Types.Mixed], default: [] },
    slowMoving: { type: [Schema.Types.Mixed], default: [] },
    marginAlerts: { type: [Schema.Types.Mixed], default: [] },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiInventoryFindingSchema.index({ tenantId: 1, period: 1 }, { unique: true });

const AiInventoryFinding: Model<IAiInventoryFinding> =
  (mongoose.models.AiInventoryFinding as Model<IAiInventoryFinding>) || mongoose.model<IAiInventoryFinding>("AiInventoryFinding", AiInventoryFindingSchema);

export default AiInventoryFinding;

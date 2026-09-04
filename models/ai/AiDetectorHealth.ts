import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-15's precision budget (docs/ai/BRIEF-05-BATCH-D.md A.5) — "the mechanism that keeps the
 * feature alive." One row per `{tenantId, detectorId}`. `sampleSize` counts REVIEWED anomalies
 * (`confirmed + dismissed`), not raised ones — precision is only meaningful once a human has
 * actually judged some. `autoDisabled` flips true (once) when `sampleSize >= MIN_SAMPLE` and
 * `precision < PRECISION_FLOOR`; a detector that has auto-disabled stops raising new anomalies
 * on every subsequent run until a human re-enables it (no tool does that automatically — this is
 * a deliberate one-way safety valve, not a self-healing toggle).
 */

export interface IAiDetectorHealth extends Document {
  tenantId: string;
  detectorId: string;
  raised: number;
  confirmed: number;
  dismissed: number;
  precision: number | null;
  sampleSize: number;
  autoDisabled: boolean;
  autoDisabledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiDetectorHealthSchema: Schema<IAiDetectorHealth> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    detectorId: { type: String, required: true },
    raised: { type: Number, default: 0 },
    confirmed: { type: Number, default: 0 },
    dismissed: { type: Number, default: 0 },
    precision: { type: Number, default: null },
    sampleSize: { type: Number, default: 0 },
    autoDisabled: { type: Boolean, default: false },
    autoDisabledAt: { type: Date },
  },
  { timestamps: true },
);

AiDetectorHealthSchema.index({ tenantId: 1, detectorId: 1 }, { unique: true });

const AiDetectorHealth: Model<IAiDetectorHealth> =
  (mongoose.models.AiDetectorHealth as Model<IAiDetectorHealth>) ||
  mongoose.model<IAiDetectorHealth>("AiDetectorHealth", AiDetectorHealthSchema);

export default AiDetectorHealth;

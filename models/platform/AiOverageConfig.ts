import mongoose, { Schema, Document, Model } from "mongoose";

/** Source doc §16. */
export interface IAiOverageConfig extends Document {
  tenantId: string;
  enabled: boolean;
  ratePerCreditUsd: number;
  softLimitUsd: number;
  hardLimitUsd: number;
  alertThresholds: number[];
  createdAt: Date;
  updatedAt: Date;
}

const AiOverageConfigSchema = new Schema<IAiOverageConfig>(
  {
    tenantId: { type: String, required: true, unique: true },
    enabled: { type: Boolean, required: true, default: false },
    ratePerCreditUsd: { type: Number, required: true, default: 0 },
    softLimitUsd: { type: Number, required: true, default: 0 },
    hardLimitUsd: { type: Number, required: true, default: 0 },
    alertThresholds: { type: [Number], default: [50, 75, 90, 100] },
  },
  { timestamps: true },
);

export default (mongoose.models.AiOverageConfig as Model<IAiOverageConfig>) ||
  mongoose.model<IAiOverageConfig>("AiOverageConfig", AiOverageConfigSchema);

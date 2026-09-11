import mongoose, { Schema, Document, Model } from "mongoose";

/** Source doc §29 — per-request external API call log, keyed to an ApiKey.
 *  Never written by anything today (no external API exists) — see
 *  models/platform/ApiKey.ts's own note. */
export interface IApiUsage extends Document {
  apiKeyId: mongoose.Types.ObjectId;
  tenantId: string;
  route: string;
  statusCode: number;
  latencyMs: number;
  createdAt: Date;
}

const ApiUsageSchema = new Schema<IApiUsage>(
  {
    apiKeyId: { type: Schema.Types.ObjectId, ref: "ApiKey", required: true },
    tenantId: { type: String, required: true },
    route: { type: String, required: true },
    statusCode: { type: Number, required: true },
    latencyMs: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ApiUsageSchema.index({ apiKeyId: 1, createdAt: -1 });
ApiUsageSchema.index({ tenantId: 1, createdAt: -1 });

export default (mongoose.models.ApiUsage as Model<IApiUsage>) ||
  mongoose.model<IApiUsage>("ApiUsage", ApiUsageSchema);

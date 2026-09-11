import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Source doc §29. Confirmed (docs/admin/SYSTEM_INVENTORY_DELTA.md /
 * PHASE-6-plan.md): no external API/API-key concept exists anywhere in this
 * codebase today — every /api/** route is browser-session-authenticated,
 * not key-authenticated. This model exists so the monitoring UI has
 * something real to query (and will show a real, non-empty result the
 * moment an external API is ever built) — per the brief's own instruction
 * to build the model with an honest empty state rather than skip it.
 * Never seeded with fabricated rows.
 */
export interface IApiKey extends Document {
  tenantId: string;
  label: string;
  keyHash: string;
  lastUsedAt?: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    tenantId: { type: String, required: true },
    label: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    lastUsedAt: { type: Date },
    revokedAt: { type: Date },
  },
  { timestamps: true },
);

ApiKeySchema.index({ tenantId: 1 });

export default (mongoose.models.ApiKey as Model<IApiKey>) ||
  mongoose.model<IApiKey>("ApiKey", ApiKeySchema);

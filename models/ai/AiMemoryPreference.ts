import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAiMemoryPreference extends Document {
  tenantId: string;
  userId: mongoose.Types.ObjectId;
  enabled: boolean;
  updatedAt: Date;
}

const AiMemoryPreferenceSchema: Schema<IAiMemoryPreference> = new Schema({
  tenantId: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

AiMemoryPreferenceSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

const AiMemoryPreference: Model<IAiMemoryPreference> =
  (mongoose.models?.AiMemoryPreference as Model<IAiMemoryPreference>) ||
  mongoose.model<IAiMemoryPreference>("AiMemoryPreference", AiMemoryPreferenceSchema);

export default AiMemoryPreference;

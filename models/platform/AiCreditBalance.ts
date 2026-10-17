import mongoose, { Schema, Document, Model } from "mongoose";
export interface IAiCreditBalance extends Document { tenantId: string; period: string; limit: number; used: number; reserved: number; }
const schema = new Schema<IAiCreditBalance>({
  tenantId: { type: String, required: true }, period: { type: String, required: true },
  limit: { type: Number, required: true, min: 0 }, used: { type: Number, required: true, min: 0, default: 0 }, reserved: { type: Number, required: true, min: 0, default: 0 },
}, { timestamps: true });
schema.index({ tenantId: 1, period: 1 }, { unique: true });
export default (mongoose.models.AiCreditBalance as Model<IAiCreditBalance>) || mongoose.model<IAiCreditBalance>("AiCreditBalance", schema);

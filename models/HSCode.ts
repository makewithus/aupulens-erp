import mongoose, { Schema, models, model, Model } from 'mongoose';

export interface IHSCode extends mongoose.Document {
  tenantId: string;
  hsCode: string;
  description: string;
  category: string;
  dutyRate: number;
  taxRate: number;
  restrictions?: string[];
  requiredDocuments?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const HSCodeSchema = new Schema<IHSCode>({
  tenantId: { type: String, required: true, index: true },
  hsCode: { type: String, required: true, unique: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  dutyRate: { type: Number, required: true, default: 0 },
  taxRate: { type: Number, required: true, default: 0 },
  restrictions: [{ type: String }],
  requiredDocuments: [{ type: String }],
  notes: { type: String },
}, { timestamps: true });

const HSCode: Model<IHSCode> =
  (models.HSCode as Model<IHSCode>) ||
  model<IHSCode>('HSCode', HSCodeSchema);
export default HSCode;

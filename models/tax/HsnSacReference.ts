import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHsnSacReference extends Document {
  code: string;
  type: "goods" | "service";
  description: string;
  gstRate: number;
  gstTreatment: "taxable" | "exempt" | "nil" | "non-gst" | "out-of-scope";
  sourceId: string;
  sourceName?: string;
  version?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  keywords: string[];
  active: boolean;
}

const HsnSacReferenceSchema = new Schema<IHsnSacReference>(
  {
    code: { type: String, required: true, trim: true },
    type: { type: String, enum: ["goods", "service"], required: true },
    description: { type: String, required: true },
    gstRate: { type: Number, required: true, min: 0, max: 100 },
    gstTreatment: { type: String, enum: ["taxable", "exempt", "nil", "non-gst", "out-of-scope"], required: true },
    sourceId: { type: String, required: true },
    sourceName: { type: String },
    version: { type: String },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date },
    keywords: [{ type: String }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

HsnSacReferenceSchema.index({ code: 1, type: 1, effectiveFrom: -1 });
HsnSacReferenceSchema.index({ type: 1, active: 1 });
HsnSacReferenceSchema.index({ description: "text", keywords: "text", code: "text" });

export default (mongoose.models.HsnSacReference as Model<IHsnSacReference>) ||
  mongoose.model<IHsnSacReference>("HsnSacReference", HsnSacReferenceSchema);

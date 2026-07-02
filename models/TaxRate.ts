import mongoose, { Schema, Document, Model } from "mongoose";
import { TAX_RATE_TYPE_VALUES, TAX_RATE_TYPE, type TaxRateType } from "@/lib/constants/statuses";

export interface ITaxRate extends Document {
  tenantId: string;
  name: string;
  type: TaxRateType;
  ratePercent: number;
  appliesTo: "sales" | "purchase" | "both";
  accountId?: mongoose.Types.ObjectId;
  sectionCode?: string;
  status: "active" | "inactive";
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TaxRateSchema: Schema<ITaxRate> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: TAX_RATE_TYPE_VALUES, default: TAX_RATE_TYPE.GST },
    ratePercent: { type: Number, required: true, default: 0 },
    appliesTo: { type: String, enum: ["sales", "purchase", "both"], default: "both" },
    accountId: { type: Schema.Types.ObjectId, ref: "Account" },
    sectionCode: { type: String, trim: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

TaxRateSchema.index({ tenantId: 1, type: 1, name: 1 }, { unique: true });

const TaxRate: Model<ITaxRate> =
  (mongoose.models.TaxRate as Model<ITaxRate>) ||
  mongoose.model<ITaxRate>("TaxRate", TaxRateSchema);

export default TaxRate;

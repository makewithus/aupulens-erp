import mongoose, { Schema, Document, Model } from "mongoose";
import {
  CUSTOM_FIELD_TYPE_VALUES,
  CUSTOM_FIELD_TYPE,
  CUSTOM_FIELD_APPLIES_TO_VALUES,
  type CustomFieldType,
  type CustomFieldAppliesTo,
} from "@/lib/constants/statuses";

export interface ICustomField extends Document {
  tenantId: string;
  appliesTo: CustomFieldAppliesTo;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  showInAllPdfs: boolean;
  status: "active" | "inactive";
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomFieldSchema: Schema<ICustomField> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    appliesTo: { type: String, enum: CUSTOM_FIELD_APPLIES_TO_VALUES, required: true },
    label: { type: String, required: true, trim: true },
    fieldType: { type: String, enum: CUSTOM_FIELD_TYPE_VALUES, default: CUSTOM_FIELD_TYPE.TEXT },
    options: [{ type: String }],
    required: { type: Boolean, default: false },
    showInAllPdfs: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

CustomFieldSchema.index({ tenantId: 1, appliesTo: 1, label: 1 }, { unique: true });

const CustomField: Model<ICustomField> =
  (mongoose.models.CustomField as Model<ICustomField>) ||
  mongoose.model<ICustomField>("CustomField", CustomFieldSchema);

export default CustomField;

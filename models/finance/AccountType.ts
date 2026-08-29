import mongoose, { Schema, Document } from "mongoose";

export interface IAccountType extends Document {
  tenantId: string;
  name: string;
  segment: string;
  description?: string;
  status: "active" | "inactive";
  isSystem: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AccountTypeSchema: Schema<IAccountType> = new Schema(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    segment: { type: String, required: true, trim: true },
    description: { type: String },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

AccountTypeSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const AccountType =
  (mongoose.models?.AccountType as mongoose.Model<IAccountType>) ||
  mongoose.model<IAccountType>("AccountType", AccountTypeSchema);

export default AccountType;

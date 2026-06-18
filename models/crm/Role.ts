import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRole extends Document {
  tenantId: string;
  name: string; // e.g., "Sales Manager", "Support Agent"
  description?: string;
  permissions: mongoose.Types.ObjectId[]; // Array of Permission IDs
  hierarchy_level: number; // For visibility rules (e.g. 100 for exec, 10 for rep)
  is_system: boolean; // Cannot be deleted if true
  createdBy: mongoose.Types.ObjectId;
}

const RoleSchema = new Schema<IRole>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    permissions: [{ type: Schema.Types.ObjectId, ref: "CrmPermission" }],
    hierarchy_level: { type: Number, default: 0 },
    is_system: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

RoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default (mongoose.models.CrmRole as Model<IRole>) ||
  mongoose.model<IRole>("CrmRole", RoleSchema);

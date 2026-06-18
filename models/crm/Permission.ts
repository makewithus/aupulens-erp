import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPermission extends Document {
  tenantId: string;
  name: string; // e.g., "campaign.read"
  description?: string;
  module: string; // e.g., "campaign", "lead"
}

const PermissionSchema = new Schema<IPermission>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    module: { type: String, required: true },
  },
  { timestamps: true }
);

PermissionSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default (mongoose.models.CrmPermission as Model<IPermission>) ||
  mongoose.model<IPermission>("CrmPermission", PermissionSchema);

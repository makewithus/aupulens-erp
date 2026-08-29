import mongoose, { Schema, Document } from "mongoose";

export interface IAccountant extends Document {
  tenantId?: string;
  name: string;
  firmName: string;
  country: string;
  state: string;
  phone: string;
  email: string;
  website?: string;
  logoUrl?: string;
  partnerBadge?: string;
  description?: string;
  servicesOffered?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AccountantSchema: Schema<IAccountant> = new Schema(
  {
    tenantId: { type: String, index: true },
    name: { type: String, required: true, trim: true },
    firmName: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    website: { type: String },
    logoUrl: { type: String },
    partnerBadge: { type: String },
    description: { type: String },
    servicesOffered: [{ type: String }],
  },
  { timestamps: true },
);

// Allow filtering by country/state efficiently
AccountantSchema.index({ country: 1, state: 1 });
// tenantId already has a field-level index (see schema above) — no separate call needed.

const Accountant =
  (mongoose.models?.Accountant as mongoose.Model<IAccountant>) ||
  mongoose.model<IAccountant>("Accountant", AccountantSchema);

export default Accountant;

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAccount extends Document {
  tenantId: string;
  company_name: string;
  type?: string;
  industry?: string;
  size?: string;
  website?: string;
  billing_address?: string;
  shipping_address?: string;
  tax_id?: string;
  owner_id?: mongoose.Types.ObjectId;
  status: string;
  source?: string;
  relationship_value: number;
  lifetime_value: number;
  account_health_score: number;
  segment?: string;
  tags: string[];
  createdBy: mongoose.Types.ObjectId;
}

const AccountSchema = new Schema<IAccount>({
  tenantId: { type: String, required: true },
  company_name: { type: String, required: true },
  type: { type: String, enum: ['Prospect','Customer','Partner','Vendor','Other'] },
  industry: { type: String },
  size: { type: String, enum: ['1-10','11-50','51-200','201-500','500+'] },
  website: { type: String },
  billing_address: { type: String },
  shipping_address: { type: String },
  tax_id: { type: String },
  owner_id: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['Active','Inactive','At Risk','Churned'], default: 'Active' },
  source: { type: String },
  relationship_value: { type: Number, default: 0 },
  lifetime_value: { type: Number, default: 0 },
  account_health_score: { type: Number, default: 0, min: 0, max: 100 },
  segment: { type: String, enum: ['Strategic','Standard','Recurring','One-Time'] },
  tags: [{ type: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

AccountSchema.index({ tenantId: 1 });
AccountSchema.index({ tenantId: 1, owner_id: 1 });
AccountSchema.index({ tenantId: 1, type: 1 });
AccountSchema.index({ tenantId: 1, createdAt: -1 });

export default (mongoose.models.CrmAccount as Model<IAccount>) || mongoose.model<IAccount>("CrmAccount", AccountSchema);

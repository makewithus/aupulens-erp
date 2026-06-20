import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContact extends Document {
  tenantId: string;
  first_name: string;
  last_name: string;
  designation?: string;
  email?: string;
  mobile?: string;
  department?: string;
  role_in_buying?: string;
  preferred_communication?: string;
  account_id: mongoose.Types.ObjectId;
  is_primary: boolean;
  is_decision_maker: boolean;
  opt_in_status: boolean;
  tags: string[];
  createdBy: mongoose.Types.ObjectId;
}

const ContactSchema = new Schema<IContact>({
  tenantId: { type: String, required: true },
  first_name: { type: String, required: true },
  last_name: { type: String, required: true },
  designation: { type: String },
  email: { type: String },
  mobile: { type: String },
  department: { type: String },
  role_in_buying: { type: String, enum: ['Decision Maker','Influencer','Finance Contact','Technical Contact','Procurement','Support Contact','Executive Sponsor','End User'] },
  preferred_communication: { type: String, enum: ['Email','Phone','WhatsApp','Meeting'] },
  account_id: { type: Schema.Types.ObjectId, ref: 'CrmAccount', required: true },
  is_primary: { type: Boolean, default: false },
  is_decision_maker: { type: Boolean, default: false },
  opt_in_status: { type: Boolean, default: true },
  tags: [{ type: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

ContactSchema.index({ tenantId: 1 });
ContactSchema.index({ tenantId: 1, account_id: 1 });
ContactSchema.index({ tenantId: 1, createdAt: -1 });
ContactSchema.index({ tenantId: 1, email: 1 });

export default (mongoose.models.CrmContact as Model<IContact>) || mongoose.model<IContact>("CrmContact", ContactSchema);

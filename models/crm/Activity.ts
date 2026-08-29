import mongoose, { Schema, Document, Model } from "mongoose";

export interface IActivity extends Document {
  tenantId: string;
  type: string;
  subject: string;
  description?: string;
  performed_by_id: mongoose.Types.ObjectId;
  participants: { ref_type: string; ref_id: mongoose.Types.ObjectId }[];
  activity_date: Date;
  outcome?: string;
  followup_date?: Date;
  linked_lead_id?: mongoose.Types.ObjectId;
  linked_account_id?: mongoose.Types.ObjectId;
  linked_contact_id?: mongoose.Types.ObjectId;
  linked_opportunity_id?: mongoose.Types.ObjectId;
  linked_case_id?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const ActivitySchema = new Schema<IActivity>({
  tenantId: { type: String, required: true },
  type: { 
    type: String, 
    required: true, 
    enum: ['Call','Email','Meeting','Note','Task','Visit','Quote Sent','Proposal Discussed','Document Shared','WhatsApp','Support Interaction'] 
  },
  subject: { type: String, required: true },
  description: { type: String },
  performed_by_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{
    ref_type: { type: String },
    ref_id: { type: Schema.Types.ObjectId }
  }],
  activity_date: { type: Date, required: true, default: Date.now },
  outcome: { type: String },
  followup_date: { type: Date },
  linked_lead_id: { type: Schema.Types.ObjectId, ref: 'CrmLead' },
  linked_account_id: { type: Schema.Types.ObjectId, ref: 'CrmAccount' },
  linked_contact_id: { type: Schema.Types.ObjectId, ref: 'CrmContact' },
  linked_opportunity_id: { type: Schema.Types.ObjectId, ref: 'CrmOpportunity' },
  linked_case_id: { type: Schema.Types.ObjectId, ref: 'CrmCase' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

ActivitySchema.index({ tenantId: 1, activity_date: -1 });
ActivitySchema.index({ tenantId: 1, type: 1 });
ActivitySchema.index({ tenantId: 1, linked_lead_id: 1 });
ActivitySchema.index({ tenantId: 1, linked_account_id: 1 });
ActivitySchema.index({ tenantId: 1, linked_contact_id: 1 });
ActivitySchema.index({ tenantId: 1, linked_opportunity_id: 1 });
ActivitySchema.index({ tenantId: 1, linked_case_id: 1 });

export default (mongoose.models.CrmActivity as Model<IActivity>) || mongoose.model<IActivity>("CrmActivity", ActivitySchema);

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IOpportunity extends Document {
  tenantId: string;
  deal_name: string;
  account_id: mongoose.Types.ObjectId;
  contact_ids: mongoose.Types.ObjectId[];
  owner_id: mongoose.Types.ObjectId;
  stage: string;
  probability: number;
  amount: number;
  expected_close_date?: Date;
  source?: string;
  product_service_line?: string;
  competitors?: string;
  priority: string;
  next_action?: string;
  notes?: string;
  loss_reason?: string;
  win_reason?: string;
  stage_entered_at: Date;
  stage_history: { stage: string; entered_at: Date; exited_at?: Date }[];
  lead_id?: mongoose.Types.ObjectId;
  campaign_id?: mongoose.Types.ObjectId;
  is_at_risk: boolean;
  createdBy: mongoose.Types.ObjectId;
  detailed_competitors?: any[];
  stakeholders?: any[];
  budget_confirmed?: boolean;
  timeline_confirmed?: boolean;
  risk_level?: string;
  weighted_value?: number;
  forecast_category?: string;
  attachments?: { name: string; url: string; uploadedAt: Date }[];
  tags?: string[];
}

const OpportunitySchema = new Schema<IOpportunity>({
  tenantId: { type: String, required: true },
  deal_name: { type: String, required: true },
  account_id: { type: Schema.Types.ObjectId, ref: 'CrmAccount', required: true },
  contact_ids: [{ type: Schema.Types.ObjectId, ref: 'CrmContact' }],
  owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  stage: { 
    type: String, 
    required: true, 
    enum: ['Prospecting','Discovery','Requirement Gathering','Solution Fit','Proposal Sent','Negotiation','Approval','Closed Won','Closed Lost'], 
    default: 'Prospecting' 
  },
  probability: { type: Number, default: 10, min: 0, max: 100 },
  amount: { type: Number, default: 0 },
  expected_close_date: { type: Date },
  source: { type: String },
  product_service_line: { type: String },
  competitors: { type: String },
  priority: { type: String, enum: ['Low','Medium','High'], default: 'Medium' },
  next_action: { type: String },
  notes: { type: String },
  loss_reason: { type: String },
  win_reason: { type: String },
  stage_entered_at: { type: Date, default: Date.now },
  stage_history: [{
    stage: { type: String },
    entered_at: { type: Date },
    exited_at: { type: Date }
  }],
  lead_id: { type: Schema.Types.ObjectId, ref: 'CrmLead' },
  campaign_id: { type: Schema.Types.ObjectId, ref: 'CrmCampaign' },
  is_at_risk: { type: Boolean, default: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  detailed_competitors: [{
    name: String,
    strengths: String,
    weaknesses: String,
    risk_level: { type: String, enum: ['Low', 'Medium', 'High'] }
  }],
  stakeholders: [{
    contact_id: { type: Schema.Types.ObjectId, ref: 'CrmContact' },
    role: { type: String, enum: ['Decision Maker', 'Influencer', 'Finance Contact', 'Technical Contact', 'Procurement Contact', 'Executive Sponsor', 'End User', 'Champion', 'Economic Buyer', 'Technical Buyer'] }
  }],
  budget_confirmed: { type: Boolean, default: false },
  timeline_confirmed: { type: Boolean, default: false },
  risk_level: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  weighted_value: { type: Number, default: 0 },
  forecast_category: { type: String, enum: ['Omitted', 'Pipeline', 'Best Case', 'Commit', 'Closed'], default: 'Pipeline' },
  attachments: [{
    name: { type: String },
    url: { type: String },
    uploadedAt: { type: Date, default: Date.now }
  }],
  tags: [{ type: String }]
}, { timestamps: true });

OpportunitySchema.index({ tenantId: 1, stage: 1 });
OpportunitySchema.index({ tenantId: 1, owner_id: 1, stage: 1 });
OpportunitySchema.index({ tenantId: 1, is_at_risk: 1 });
OpportunitySchema.index({ tenantId: 1, expected_close_date: 1 });
OpportunitySchema.index({ tenantId: 1, account_id: 1 });

export default (mongoose.models.CrmOpportunity as Model<IOpportunity & any>) || mongoose.model<IOpportunity & any>("CrmOpportunity", OpportunitySchema);

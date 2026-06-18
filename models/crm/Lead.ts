import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILead extends Document {
  tenantId: string;
  lead_name: string;
  company_name?: string;
  phone?: string;
  email?: string;
  source?: string;
  owner_id: mongoose.Types.ObjectId;
  status: string;
  industry?: string;
  location?: string;
  interest_category?: string;
  service_product_interest?: string;
  budget_range?: string;
  expected_timeline?: string;
  priority: string;
  notes?: string;
  tags: string[];
  assigned_team_member_id?: mongoose.Types.ObjectId;
  last_contact_date?: Date;
  next_followup_date?: Date;
  lead_score: number;
  disqualification_reason?: string;
  campaign_id?: mongoose.Types.ObjectId;
  converted_at?: Date;
  converted_account_id?: mongoose.Types.ObjectId;
  converted_contact_id?: mongoose.Types.ObjectId;
  converted_opportunity_id?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const LeadSchema = new Schema<ILead>({
  tenantId: { type: String, required: true },
  lead_name: { type: String, required: true },
  company_name: { type: String },
  phone: { type: String },
  email: { type: String },
  source: { 
    type: String, 
    enum: ['Organic Search','Paid Ads','Referral','Event','Social Media','Direct Website','Outbound Calling','Partner Channel','Repeat Customer','Website Form','WhatsApp','Email Import','CSV Import','Chatbot','Manual Entry','Other'] 
  },
  owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['New','Attempting Contact','Connected','Qualified','Nurture','Disqualified','Converted'], 
    default: 'New' 
  },
  industry: { type: String },
  location: { type: String },
  interest_category: { type: String },
  service_product_interest: { type: String },
  budget_range: { type: String },
  expected_timeline: { type: String },
  priority: { 
    type: String, 
    enum: ['Low','Medium','High'], 
    default: 'Medium' 
  },
  notes: { type: String },
  tags: [{ type: String }],
  assigned_team_member_id: { type: Schema.Types.ObjectId, ref: 'User' },
  last_contact_date: { type: Date },
  next_followup_date: { type: Date },
  lead_score: { type: Number, default: 0, min: 0, max: 100 },
  disqualification_reason: { type: String },
  campaign_id: { type: Schema.Types.ObjectId, ref: 'CrmCampaign' },
  converted_at: { type: Date },
  converted_account_id: { type: Schema.Types.ObjectId, ref: 'CrmAccount' },
  converted_contact_id: { type: Schema.Types.ObjectId, ref: 'CrmContact' },
  converted_opportunity_id: { type: Schema.Types.ObjectId, ref: 'CrmOpportunity' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

LeadSchema.index({ tenantId: 1 });

export default (mongoose.models.CrmLead as Model<ILead>) || mongoose.model<ILead>("CrmLead", LeadSchema);

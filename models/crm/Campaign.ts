import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICampaign extends Document {
  tenantId: string;
  campaign_name: string;
  campaign_code: string;
  owner_id: mongoose.Types.ObjectId;
  channel: string;
  status: string;
  budget: number;
  target_audience?: string;
  start_date: Date;
  end_date?: Date;
  expected_leads: number;
  expected_revenue: number;
  attributed_revenue: number;
  actual_revenue: number;
  roi_percentage: number;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
}

const CampaignSchema = new Schema<ICampaign>({
  tenantId: { type: String, required: true },
  campaign_name: { type: String, required: true },
  campaign_code: { type: String, required: true },
  owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  channel: {
    type: String,
    required: true,
    enum: [
      'Organic Search', 'Paid Search', 'Facebook', 'Instagram',
      'LinkedIn', 'Referral', 'Event', 'Trade Show',
      'Direct Website', 'WhatsApp', 'Outbound Calling', 'Partner Channel'
    ]
  },
  status: {
    type: String,
    required: true,
    enum: ['Draft', 'Planned', 'Active', 'Paused', 'Completed', 'Archived'],
    default: 'Draft'
  },
  budget: { type: Number, default: 0, min: 0 },
  target_audience: { type: String },
  start_date: { type: Date, required: true },
  end_date: { type: Date },
  expected_leads: { type: Number, default: 0, min: 0 },
  expected_revenue: { type: Number, default: 0, min: 0 },
  attributed_revenue: { type: Number, default: 0, min: 0 },
  actual_revenue: { type: Number, default: 0, min: 0 },
  roi_percentage: { type: Number, default: 0 },
  notes: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

CampaignSchema.index({ tenantId: 1 });
CampaignSchema.index({ tenantId: 1, status: 1 });
CampaignSchema.index({ tenantId: 1, channel: 1 });
CampaignSchema.index({ tenantId: 1, campaign_code: 1 }, { unique: true });

export default (mongoose.models.CrmCampaign as Model<ICampaign>) || mongoose.model<ICampaign>("CrmCampaign", CampaignSchema);

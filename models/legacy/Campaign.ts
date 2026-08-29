import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICampaign extends Document {
  tenantId: string;
  name: string;
  channel: string;
  start_date: Date;
  end_date: Date;
  budget: number;
  target_audience: string;
  owner_id: mongoose.Types.ObjectId;
  status: string;
  leads_generated: number;
  conversions: number;
  cost_per_lead: number;
  revenue_attributed: number;
  createdBy: mongoose.Types.ObjectId;
}

const CampaignSchema = new Schema<ICampaign>({
  tenantId: { type: String, required: true },
  name: { type: String, required: true },
  channel: { type: String },
  start_date: { type: Date },
  end_date: { type: Date },
  budget: { type: Number },
  target_audience: { type: String },
  owner_id: { type: Schema.Types.ObjectId, ref: "User" },
  status: { type: String, default: "Draft" },
  leads_generated: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  cost_per_lead: { type: Number, default: 0 },
  revenue_attributed: { type: Number, default: 0 },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default (mongoose.models.Campaign as Model<ICampaign>) || mongoose.model<ICampaign>("Campaign", CampaignSchema);

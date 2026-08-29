import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContract extends Document {
  tenantId: string;
  contract_number: string;
  account_id: mongoose.Types.ObjectId;
  opportunity_id?: mongoose.Types.ObjectId;
  quote_id?: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  status: string;
  start_date: Date;
  end_date: Date;
  renewal_date?: Date;
  contract_value: number;
  billing_frequency: string;
  terms?: string;
  notes?: string;
  auto_renew: boolean;
  churn_risk: string;
  renewal_status: string;
  renewal_opportunity_id?: mongoose.Types.ObjectId;
  // Renewal reminder tracking
  reminder_90_sent: boolean;
  reminder_60_sent: boolean;
  reminder_30_sent: boolean;
  reminder_7_sent: boolean;
  campaign_id?: mongoose.Types.ObjectId;
  source?: string;
  createdBy: mongoose.Types.ObjectId;
}

const ContractSchema = new Schema<IContract>(
  {
    tenantId: { type: String, required: true },
    contract_number: { type: String, required: true },
    account_id: { type: Schema.Types.ObjectId, ref: "CrmAccount", required: true },
    opportunity_id: { type: Schema.Types.ObjectId, ref: "CrmOpportunity" },
    quote_id: { type: Schema.Types.ObjectId, ref: "CrmQuote" },
    owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: [
        "Draft",
        "Pending Signature",
        "Active",
        "Renewal Due",
        "Expiring",
        "Renewed",
        "Expired",
        "Cancelled",
      ],
      default: "Draft",
    },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    renewal_date: { type: Date },
    contract_value: { type: Number, required: true, default: 0, min: 0 },
    billing_frequency: {
      type: String,
      enum: ["Monthly", "Quarterly", "Semi-Annual", "Annual", "One-Time"],
      default: "Annual",
    },
    terms: { type: String },
    notes: { type: String },
    auto_renew: { type: Boolean, default: false },
    churn_risk: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Low",
    },
    renewal_status: {
      type: String,
      enum: ["Not Started", "In Discussion", "Renewed", "Lost"],
      default: "Not Started",
    },
    renewal_opportunity_id: { type: Schema.Types.ObjectId, ref: "CrmOpportunity" },
    reminder_90_sent: { type: Boolean, default: false },
    reminder_60_sent: { type: Boolean, default: false },
    reminder_30_sent: { type: Boolean, default: false },
    reminder_7_sent: { type: Boolean, default: false },
    campaign_id: { type: Schema.Types.ObjectId, ref: 'CrmCampaign' },
    source: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ContractSchema.index({ tenantId: 1 });
ContractSchema.index({ tenantId: 1, contract_number: 1 }, { unique: true });
ContractSchema.index({ tenantId: 1, status: 1 });
ContractSchema.index({ tenantId: 1, end_date: 1 });
ContractSchema.index({ tenantId: 1, account_id: 1 });
ContractSchema.index({ tenantId: 1, owner_id: 1 });
ContractSchema.index({ tenantId: 1, churn_risk: 1 });

export default (mongoose.models.CrmContract as Model<IContract>) ||
  mongoose.model<IContract>("CrmContract", ContractSchema);

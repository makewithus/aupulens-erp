import mongoose, { Schema, Document, Model } from "mongoose";

export interface IContract extends Document {
  tenantId: string;
  contract_number: string;
  account_id: mongoose.Types.ObjectId;
  opportunity_id: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  status: string;
  start_date: Date;
  end_date: Date;
  value: number;
  renewal_date: Date;
  auto_renew: boolean;
  churn_risk: string;
  renewal_status: string;
  notes: string;
  createdBy: mongoose.Types.ObjectId;
}

const ContractSchema = new Schema<IContract>({
  tenantId: { type: String, required: true },
  contract_number: { type: String, required: true, unique: true },
  account_id: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  opportunity_id: { type: Schema.Types.ObjectId, ref: "Opportunity" },
  owner_id: { type: Schema.Types.ObjectId, ref: "User" },
  status: { type: String, default: "Draft" },
  start_date: { type: Date },
  end_date: { type: Date },
  value: { type: Number },
  renewal_date: { type: Date },
  auto_renew: { type: Boolean },
  churn_risk: { type: String },
  renewal_status: { type: String },
  notes: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default (mongoose.models.Contract as Model<IContract>) || mongoose.model<IContract>("Contract", ContractSchema);

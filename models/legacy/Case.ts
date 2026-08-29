import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICase extends Document {
  tenantId: string;
  case_number: string;
  title: string;
  description: string;
  account_id: mongoose.Types.ObjectId;
  contact_id: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  category: string;
  subcategory: string;
  severity: string;
  status: string;
  sla_target_at: Date;
  sla_breached: boolean;
  escalation_level: number;
  resolution_summary: string;
  closure_reason: string;
  satisfaction_score: number;
  createdBy: mongoose.Types.ObjectId;
}

const CaseSchema = new Schema<ICase>({
  tenantId: { type: String, required: true },
  case_number: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  account_id: { type: Schema.Types.ObjectId, ref: "Account", required: true },
  contact_id: { type: Schema.Types.ObjectId, ref: "Contact" },
  owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String },
  subcategory: { type: String },
  severity: { type: String, default: "Low" },
  status: { type: String, default: "New" },
  sla_target_at: { type: Date },
  sla_breached: { type: Boolean, default: false },
  escalation_level: { type: Number, default: 0 },
  resolution_summary: { type: String },
  closure_reason: { type: String },
  satisfaction_score: { type: Number },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

export default (mongoose.models.Case as Model<ICase>) || mongoose.model<ICase>("Case", CaseSchema);

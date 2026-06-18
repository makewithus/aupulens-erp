import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICase extends Document {
  tenantId: string;
  case_number: string;
  title: string;
  description?: string;
  account_id: mongoose.Types.ObjectId;
  contact_id?: mongoose.Types.ObjectId;
  owner_id: mongoose.Types.ObjectId;
  category?: string;
  subcategory?: string;
  severity: string;
  status: string;
  sla_target_at?: Date;
  sla_breached: boolean;
  escalation_level: number;
  resolution_summary?: string;
  closure_reason?: string;
  satisfaction_score?: number;
  createdBy: mongoose.Types.ObjectId;
  escalation_history?: { level: number; previous_level: number; trigger: string; user_id: mongoose.Types.ObjectId; timestamp: Date }[];
  satisfaction_comment?: string;
  satisfaction_submitted_at?: Date;
}

const CaseSchema = new Schema<ICase>({
  tenantId: { type: String, required: true },
  case_number: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  account_id: { type: Schema.Types.ObjectId, ref: 'CrmAccount', required: true },
  contact_id: { type: Schema.Types.ObjectId, ref: 'CrmContact' },
  owner_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  category: { type: String },
  subcategory: { type: String },
  severity: { type: String, enum: ['Low','Medium','High','Critical'], default: 'Low' },
  status: { type: String, enum: ['New','Open','In Progress','Waiting on Customer','Waiting on Internal Team','Resolved','Closed','Reopened'], default: 'New' },
  sla_target_at: { type: Date },
  sla_breached: { type: Boolean, default: false },
  escalation_level: { type: Number, default: 0, min: 0, max: 4 },
  escalation_history: [{
    level: { type: Number },
    previous_level: { type: Number },
    trigger: { type: String },
    user_id: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  resolution_summary: { type: String },
  closure_reason: { type: String },
  satisfaction_score: { type: Number, min: 1, max: 5 },
  satisfaction_comment: { type: String },
  satisfaction_submitted_at: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

CaseSchema.index({ tenantId: 1, status: 1 });
CaseSchema.index({ tenantId: 1, severity: 1 });
CaseSchema.index({ tenantId: 1, owner_id: 1, status: 1 });
CaseSchema.index({ tenantId: 1, sla_target_at: 1 });
CaseSchema.index({ tenantId: 1, escalation_level: 1 });

export default (mongoose.models.CrmCase as Model<ICase>) || mongoose.model<ICase>("CrmCase", CaseSchema);

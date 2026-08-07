import mongoose, { Schema, Document, Model } from "mongoose";

export interface IApprovalRequest extends Document {
  tenantId: string;
  type?: string;
  requested_by_id: mongoose.Types.ObjectId;
  approver_id: mongoose.Types.ObjectId;
  linked_record_type?: string;
  linked_record_id?: mongoose.Types.ObjectId;
  status: string;
  request_notes?: string;
  decision_notes?: string;
  decided_at?: Date;
  createdBy: mongoose.Types.ObjectId;
  // Multi-step approval chain (6.3). step_index is 0-based within the chain;
  // total_steps is the chain length; approver_role records which role this step
  // targets. Absent on legacy single-tier requests.
  step_index?: number;
  total_steps?: number;
  approver_role?: string;
  policy_id?: mongoose.Types.ObjectId;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>({
  tenantId: { type: String, required: true },
  type: { type: String, enum: ['Discount','Quote','Contract','Deal Exception','Refund','Reassignment','Special Pricing'] },
  requested_by_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  approver_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  linked_record_type: { type: String },
  linked_record_id: { type: Schema.Types.ObjectId },
  status: { type: String, enum: ['Pending','Approved','Rejected','Changes Requested'], default: 'Pending' },
  request_notes: { type: String },
  decision_notes: { type: String },
  decided_at: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  step_index: { type: Number },
  total_steps: { type: Number },
  approver_role: { type: String },
  policy_id: { type: Schema.Types.ObjectId, ref: 'CrmApprovalPolicy' },
}, { timestamps: true });

ApprovalRequestSchema.index({ tenantId: 1 });

export default (mongoose.models.CrmApprovalRequest as Model<IApprovalRequest>) || mongoose.model<IApprovalRequest>("CrmApprovalRequest", ApprovalRequestSchema);

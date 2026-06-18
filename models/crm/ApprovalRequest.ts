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
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

ApprovalRequestSchema.index({ tenantId: 1 });

export default (mongoose.models.CrmApprovalRequest as Model<IApprovalRequest>) || mongoose.model<IApprovalRequest>("CrmApprovalRequest", ApprovalRequestSchema);

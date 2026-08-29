import mongoose, { Schema, Document, Model } from "mongoose";

export interface IApprovalRequest extends Document {
  tenantId: string;
  type: string;
  requested_by_id: mongoose.Types.ObjectId;
  approver_id: mongoose.Types.ObjectId;
  linked_record_type: string;
  linked_record_id: mongoose.Types.ObjectId;
  status: string;
  request_notes: string;
  decision_notes: string;
  decided_at: Date;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>({
  tenantId: { type: String, required: true },
  type: { type: String },
  requested_by_id: { type: Schema.Types.ObjectId, ref: "User" },
  approver_id: { type: Schema.Types.ObjectId, ref: "User" },
  linked_record_type: { type: String },
  linked_record_id: { type: Schema.Types.ObjectId },
  status: { type: String, default: "Pending" },
  request_notes: { type: String },
  decision_notes: { type: String },
  decided_at: { type: Date }
}, { timestamps: true });

export default (mongoose.models.ApprovalRequest as Model<IApprovalRequest>) || mongoose.model<IApprovalRequest>("ApprovalRequest", ApprovalRequestSchema);

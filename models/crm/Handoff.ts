import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHandoff extends Document {
  tenantId: string;
  recordType: string; // Opportunity, Case, Quote, Account
  recordId: mongoose.Types.ObjectId;
  handoffType: string; // Sales -> Operations, Support -> Account Management, etc.
  fromOwner: mongoose.Types.ObjectId;
  toOwner: mongoose.Types.ObjectId;
  status: "Draft" | "Pending" | "Accepted" | "Rejected" | "Completed" | "Cancelled" | "Clarification Requested";
  priority: "Low" | "Medium" | "High" | "Critical";
  notes?: string;
  attachments?: string[];
  requiredActions: string[];
  dueDate?: Date;
  completedAt?: Date;
  acceptedAt?: Date;
  rejectedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
}

const HandoffSchema = new Schema<IHandoff>(
  {
    tenantId: { type: String, required: true },
    recordType: { type: String, required: true },
    recordId: { type: Schema.Types.ObjectId, required: true },
    handoffType: { type: String, required: true },
    fromOwner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    toOwner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["Draft", "Pending", "Accepted", "Rejected", "Completed", "Cancelled", "Clarification Requested"],
      default: "Pending",
    },
    priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
    notes: { type: String },
    attachments: [{ type: String }],
    requiredActions: [{ type: String }],
    dueDate: { type: Date },
    completedAt: { type: Date },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

HandoffSchema.index({ tenantId: 1, toOwner: 1, status: 1 });
HandoffSchema.index({ tenantId: 1, recordType: 1, recordId: 1 });

export default (mongoose.models.CrmHandoff as Model<IHandoff>) ||
  mongoose.model<IHandoff>("CrmHandoff", HandoffSchema);

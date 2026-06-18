import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICrmAuditLog extends Document {
  tenantId: string;
  user_id: mongoose.Types.ObjectId;
  action: string;
  record_type: string;
  record_id: mongoose.Types.ObjectId;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  timestamp: Date;
  ip_address?: string;
}

const ALLOWED_ACTIONS = [
  // CRUD
  "created",
  "updated",
  "deleted",
  // Status transitions
  "status_changed",
  "assigned",
  "converted",
  // Approval workflow
  "approved",
  "rejected",
  "changes_requested",
  "submitted_for_approval",
  // Document / quote lifecycle
  "upload",
  "download",
  "view",
  "send",
  "accept",
  "expire",
  "version_create",
  // Legacy aliases kept for backward compatibility
  "edit",
  "approve",
  "reject",
] as const;

const CrmAuditLogSchema = new Schema<ICrmAuditLog>({
  tenantId: { type: String, required: true, index: true },
  user_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  action: {
    type: String,
    required: true,
    enum: ALLOWED_ACTIONS,
  },
  record_type: { type: String, required: true },
  record_id: { type: Schema.Types.ObjectId, required: true },
  field_name: { type: String },
  old_value: { type: String },
  new_value: { type: String },
  timestamp: { type: Date, default: Date.now, required: true },
  ip_address: { type: String },
});

CrmAuditLogSchema.index({ tenantId: 1, record_id: 1 });
CrmAuditLogSchema.index({ tenantId: 1, action: 1 });

// Immutability guards — audit logs must never be modified or deleted
CrmAuditLogSchema.pre("updateOne", function (next) {
  next(new Error("CrmAuditLog records are immutable."));
});
CrmAuditLogSchema.pre("findOneAndUpdate", function (next) {
  next(new Error("CrmAuditLog records are immutable."));
});
CrmAuditLogSchema.pre("deleteOne", function (next) {
  next(new Error("CrmAuditLog records cannot be deleted."));
});
CrmAuditLogSchema.pre("findOneAndDelete", function (next) {
  next(new Error("CrmAuditLog records cannot be deleted."));
});
CrmAuditLogSchema.pre("deleteMany", function (next) {
  next(new Error("CrmAuditLog records cannot be deleted."));
});

export default (mongoose.models.CrmAuditLog as Model<ICrmAuditLog>) ||
  mongoose.model<ICrmAuditLog>("CrmAuditLog", CrmAuditLogSchema);

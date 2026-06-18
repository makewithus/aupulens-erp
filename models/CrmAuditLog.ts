import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICrmAuditLog extends Document {
  tenantId: string;
  user_id: mongoose.Types.ObjectId;
  action: string;
  record_type: string;
  record_id: mongoose.Types.ObjectId;
  field_name: string;
  old_value: string;
  new_value: string;
  timestamp: Date;
  ip_address: string;
}

const CrmAuditLogSchema = new Schema<ICrmAuditLog>({
  tenantId: { type: String, required: true },
  user_id: { type: Schema.Types.ObjectId, ref: "User" },
  action: { type: String },
  record_type: { type: String },
  record_id: { type: Schema.Types.ObjectId },
  field_name: { type: String },
  old_value: { type: String },
  new_value: { type: String },
  timestamp: { type: Date, default: Date.now },
  ip_address: { type: String },
}, { timestamps: true });

export default (mongoose.models.CrmAuditLog as Model<ICrmAuditLog>) || mongoose.model<ICrmAuditLog>("CrmAuditLog", CrmAuditLogSchema);

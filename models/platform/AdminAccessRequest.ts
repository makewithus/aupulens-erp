import mongoose, { Schema, Document, Model } from "mongoose";
import {
  ADMIN_ACCESS_REQUEST_STATUS,
  ADMIN_ACCESS_REQUEST_STATUS_VALUES,
  ADMIN_ACCESS_SCOPE_VALUES,
  AdminAccessRequestStatus,
  AdminAccessScope,
} from "@/lib/constants/statuses";

/**
 * Source doc §26: "Request access → reason required → approval per policy →
 * time-boxed restricted session → every action tagged → session ends → full
 * audit trail." Never open-ended — `expiresAt` is always set on approval,
 * checked live at read time (see lib/platform/access/status.ts), not
 * dependent on any cron having run.
 */
export interface IAdminAccessRequest extends Document {
  adminUserId: mongoose.Types.ObjectId;
  tenantId: string;
  reason: string;
  requestedScope: AdminAccessScope;
  status: AdminAccessRequestStatus;
  approvedBy?: mongoose.Types.ObjectId;
  deniedReason?: string;
  grantedAt?: Date;
  expiresAt?: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AdminAccessRequestSchema = new Schema<IAdminAccessRequest>(
  {
    adminUserId: { type: Schema.Types.ObjectId, ref: "AdminUser", required: true },
    tenantId: { type: String, required: true },
    reason: { type: String, required: true },
    requestedScope: { type: String, required: true, enum: ADMIN_ACCESS_SCOPE_VALUES },
    status: {
      type: String,
      required: true,
      enum: ADMIN_ACCESS_REQUEST_STATUS_VALUES,
      default: ADMIN_ACCESS_REQUEST_STATUS.PENDING,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "AdminUser" },
    deniedReason: { type: String },
    grantedAt: { type: Date },
    expiresAt: { type: Date },
    endedAt: { type: Date },
  },
  { timestamps: true },
);

AdminAccessRequestSchema.index({ adminUserId: 1, tenantId: 1, status: 1 });
AdminAccessRequestSchema.index({ tenantId: 1, status: 1 });
AdminAccessRequestSchema.index({ status: 1, expiresAt: 1 });

export default (mongoose.models.AdminAccessRequest as Model<IAdminAccessRequest>) ||
  mongoose.model<IAdminAccessRequest>("AdminAccessRequest", AdminAccessRequestSchema);

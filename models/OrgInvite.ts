import mongoose, { Schema, Document, Model } from "mongoose";
import {
  INVITE_STATUS,
  INVITE_STATUS_VALUES,
  type InviteStatus,
} from "@/lib/constants/statuses";

export interface IOrgInvite extends Document {
  tenantId: string;
  email: string;
  role: string;
  token: string;
  status: InviteStatus;
  invitedBy: mongoose.Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const OrgInviteSchema: Schema<IOrgInvite> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, required: true },
    token: { type: String, required: true },
    status: {
      type: String,
      enum: INVITE_STATUS_VALUES,
      default: INVITE_STATUS.PENDING,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  },
  { timestamps: true },
);

// Business uniqueness: one active invite slot per (tenant, email).
// Re-inviting the same email refreshes the existing record via findOneAndUpdate+upsert.
OrgInviteSchema.index({ tenantId: 1, email: 1 }, { unique: true });

// For counting pending invites by tenant efficiently.
OrgInviteSchema.index({ tenantId: 1, status: 1 });

// Token lookup at accept time — intentional bare unique.
// Tokens are 32-byte crypto random hex strings; cross-tenant collisions are
// computationally infeasible. The accept endpoint receives a token without
// knowing tenantId upfront; tenantId is read from the matched invite.
OrgInviteSchema.index({ token: 1 }, { unique: true });

const OrgInvite: Model<IOrgInvite> =
  (mongoose.models.OrgInvite as Model<IOrgInvite>) ||
  mongoose.model<IOrgInvite>("OrgInvite", OrgInviteSchema);

export default OrgInvite;

import mongoose, { Schema, Document, Model } from "mongoose";
import {
  ADMIN_ROLE_VALUES,
  ADMIN_USER_STATUS,
  ADMIN_USER_STATUS_VALUES,
  AdminRoleType,
  AdminUserStatus,
} from "@/lib/constants/statuses";

/**
 * A Global Admin identity. Deliberately NOT models/auth/User.ts with a special
 * role — this collection has no tenantId field and is never read by any
 * tenant-facing code path. See docs/admin/SYSTEM_INVENTORY_DELTA.md §1 and
 * docs/admin/OPEN_QUESTIONS.md #1 for why this is a fully separate domain
 * from the pre-existing, still-live `master-admin` User.role value.
 */
export interface IAdminUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: AdminRoleType;
  status: AdminUserStatus;
  mfaEnabled: boolean;
  // AES-256-GCM (lib/crypto.ts) encrypted TOTP secret. Never the raw secret.
  mfaSecretEncrypted?: string;
  // bcrypt-hashed one-time backup codes (never stored/returned in plaintext after issuance).
  mfaBackupCodeHashes: string[];
  failedLoginCount: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ADMIN_ROLE_VALUES },
    status: {
      type: String,
      required: true,
      enum: ADMIN_USER_STATUS_VALUES,
      default: ADMIN_USER_STATUS.ACTIVE,
    },
    mfaEnabled: { type: Boolean, required: true, default: false },
    mfaSecretEncrypted: { type: String },
    mfaBackupCodeHashes: { type: [String], default: [] },
    failedLoginCount: { type: Number, required: true, default: 0, min: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
  },
  { timestamps: true },
);

AdminUserSchema.index({ role: 1 });
AdminUserSchema.index({ status: 1 });

export default (mongoose.models.AdminUser as Model<IAdminUser>) ||
  mongoose.model<IAdminUser>("AdminUser", AdminUserSchema);

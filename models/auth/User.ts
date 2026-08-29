import mongoose, { Schema, Document } from "mongoose";
import {
  ENTITY_STATUS,
  ENTITY_STATUS_VALUES,
  type EntityStatus,
} from "@/lib/constants/statuses";

export interface IUser extends Document {
  tenantId: string; // NEW: Unique identifier for the organization
  name: string;
  email: string;
  phone: string;
  password: string;
  role:
    | "admin"
    | "finance"
    | "hr"
    | "sales"
    | "inventory"
    | "project"
    | "manufacturing"
    | "master-admin";
  department?: string;
  employeeId?: string;
  designation?: string;
  profilePic?: string;
  dateOfJoining?: Date;
  status: EntityStatus;
  // Reserved for a future granular per-user permission system. Currently
  // unused: no UI writes to it, no authorization check reads it, and no
  // existing user in production has a non-empty value here. The real
  // enforcement model today is role-based (middleware.ts route gating,
  // lib/crm/rbac.ts's requireRole for CRM writes) — do not treat this field
  // as live until it is actually wired into an authorization check.
  permissions?: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: mongoose.Types.ObjectId;
  tempToken?: string;
  tempTokenExpiry?: Date;
  // Self-service password reset (distinct from tempToken, which is the
  // short-lived post-signup auto-login token) — stores a SHA-256 hash of
  // the emailed token, never the token itself.
  passwordResetTokenHash?: string;
  passwordResetTokenExpiry?: Date;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    tenantId: { type: String, required: true, index: true }, // NEW: Index for performance
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, required: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: [
        "admin",
        "finance",
        "hr",
        "sales",
        "inventory",
        "project",
        "manufacturing",
        "master-admin",
      ],
      default: "admin",
      required: true,
    },
    department: { type: String, trim: true },
    employeeId: { type: String, trim: true },
    designation: { type: String, trim: true },
    profilePic: { type: String },
    dateOfJoining: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ENTITY_STATUS_VALUES,
      default: ENTITY_STATUS.ACTIVE,
      required: true,
    },
    permissions: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    tempToken: { type: String },
    tempTokenExpiry: { type: Date },
    passwordResetTokenHash: { type: String },
    passwordResetTokenExpiry: { type: Date },
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
UserSchema.index(
  { tenantId: 1, employeeId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      employeeId: { $exists: true, $type: "string" },
    },
  },
);
UserSchema.index({ tenantId: 1, createdAt: -1 });
UserSchema.index({ tenantId: 1, role: 1, createdAt: -1 });
UserSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

// Export the model with proper handling for Next.js hot reload
const User =
  (mongoose.models?.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);

export default User;

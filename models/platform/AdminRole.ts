import mongoose, { Schema, Document, Model } from "mongoose";
import {
  ADMIN_CAPABILITY_VALUES,
  ADMIN_ROLE_VALUES,
  AdminCapability,
  AdminRoleType,
} from "@/lib/constants/statuses";

/**
 * The §30 permission matrix, implemented as data (Hard Rule 6: "entitlements
 * / permissions are configuration, never code"). One document per AdminRoleType,
 * seeded by scripts/seed-platform-roles.ts. lib/platform/auth/adminRbac.ts is
 * the only reader. See docs/admin/OPEN_QUESTIONS.md #6 — the exact capability
 * set per role is an inferred default (the literal source-doc matrix was not
 * provided), correcting it is a data change here, never a code change.
 */
export interface IAdminRole extends Document {
  role: AdminRoleType;
  capabilities: AdminCapability[];
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminRoleSchema = new Schema<IAdminRole>(
  {
    role: {
      type: String,
      required: true,
      unique: true,
      enum: ADMIN_ROLE_VALUES,
    },
    capabilities: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator: (arr: string[]) =>
          arr.every((c) => (ADMIN_CAPABILITY_VALUES as string[]).includes(c)),
        message: "Unknown capability in AdminRole.capabilities",
      },
    },
    // Not `required` — Mongoose's built-in String required-checker treats an
    // empty string as absent, which would reject the schema-level default below.
    description: { type: String, default: "" },
  },
  { timestamps: true },
);

export default (mongoose.models.AdminRole as Model<IAdminRole>) ||
  mongoose.model<IAdminRole>("AdminRole", AdminRoleSchema);

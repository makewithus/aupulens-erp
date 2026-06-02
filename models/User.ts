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
  permissions?: string[];
  createdAt: Date;
  updatedAt: Date;
  createdBy?: mongoose.Types.ObjectId;
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

// Export the model with proper handling for Next.js hot reload
const User =
  (mongoose.models?.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);

export default User;

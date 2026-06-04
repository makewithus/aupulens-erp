import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  type SubscriptionStatus,
} from "@/lib/constants/statuses";

export interface IOrganization extends Document {
  name: string;
  subdomain: string;
  domain?: string; // For custom domains later
  ownerUserId: mongoose.Types.ObjectId;
  isActive: boolean;
  subscriptionStatus: SubscriptionStatus;
  trialEndDate?: Date;
  settings: {
    logo?: string;
    themeColor?: string;
    timezone?: string;
    currency?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema: Schema<IOrganization> = new Schema(
  {
    name: { type: String, required: true, trim: true },
    subdomain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    domain: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
    subscriptionStatus: {
      type: String,
      enum: SUBSCRIPTION_STATUS_VALUES,
      default: SUBSCRIPTION_STATUS.TRIAL,
    },
    trialEndDate: { type: Date },
    settings: {
      logo: { type: String },
      themeColor: { type: String, default: "#3b82f6" },
      timezone: { type: String, default: "UTC" },
      currency: { type: String, default: "USD" },
      country: { type: String },
      state: { type: String },
      industry: { type: String },
      isGstRegistered: { type: Boolean, default: false },
      enabledModules: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

OrganizationSchema.index({ isActive: 1 });

const Organization: Model<IOrganization> =
  (mongoose.models.Organization as Model<IOrganization>) ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);

export default Organization;

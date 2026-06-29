import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  type SubscriptionStatus,
  ORGANIZATION_TIER,
  ORGANIZATION_TIER_VALUES,
  type OrganizationTier,
} from "@/lib/constants/statuses";

export interface IOrganization extends Document {
  name: string;
  subdomain: string;
  domain?: string;
  ownerUserId: mongoose.Types.ObjectId;
  isActive: boolean;
  subscriptionStatus: SubscriptionStatus;
  trialEndDate?: Date;
  // Subscription tier — controls feature gating and usage limits
  tier: OrganizationTier;
  // Per-tier usage caps (synced from TIER_LIMITS at create time, overridable)
  maxUsers: number;
  aiCallsPerMonth: number;
  settings: {
    logo?: string;
    themeColor?: string;
    timezone?: string;
    currency?: string;
    country?: string;
    state?: string;
    industry?: string;
    isGstRegistered?: boolean;
    enabledModules?: string[];
    // Per-workspace AI preferences
    ai?: {
      model?: string;
      maxTokensPerCall?: number;
      disabled?: boolean;
    };
    // Per-workspace branding overrides
    branding?: {
      emailFooter?: string;
      pdfHeader?: string;
      fontChoice?: string;
    };
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
    // ── Phase 2 additions ─────────────────────────────────────────────────────
    tier: {
      type: String,
      enum: ORGANIZATION_TIER_VALUES,
      default: ORGANIZATION_TIER.STARTER,
    },
    maxUsers: { type: Number, default: 5 },
    aiCallsPerMonth: { type: Number, default: 100 },
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
      // Per-workspace AI preferences (Phase 2 — Step 7)
      ai: {
        model: { type: String, default: "claude-sonnet-4-6" },
        maxTokensPerCall: { type: Number, default: 1024 },
        disabled: { type: Boolean, default: false },
      },
      // Per-workspace branding overrides (Phase 2 — Step 1)
      branding: {
        emailFooter: { type: String },
        pdfHeader: { type: String },
        fontChoice: { type: String },
      },
    },
  },
  { timestamps: true },
);

OrganizationSchema.index({ isActive: 1 });
OrganizationSchema.index({ tier: 1 });

const Organization: Model<IOrganization> =
  (mongoose.models.Organization as Model<IOrganization>) ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);

export default Organization;

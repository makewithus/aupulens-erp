import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_VALUES,
  type SubscriptionStatus,
  ORGANIZATION_TIER,
  ORGANIZATION_TIER_VALUES,
  type OrganizationTier,
  ORGANIZATION_STATUS,
  ORGANIZATION_STATUS_VALUES,
  type OrganizationStatus,
  ORGANIZATION_TYPE_VALUES,
  type OrganizationTypeKey,
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
  // Global Admin control plane (docs/admin/BRIEF-GLOBAL-ADMIN.md Phase 2) —
  // additive, distinct from `subscriptionStatus` (billing-cycle state) and
  // `isActive` (a pre-existing binary login gate `SUSPENDED` also flips, see
  // docs/admin/OPEN_QUESTIONS.md #2). Optional so every pre-existing
  // Organization document (created before this field existed) remains valid;
  // read as ACTIVE when absent (lib/platform/organizations/list.ts).
  status?: OrganizationStatus;
  organizationType?: OrganizationTypeKey;
  region?: string;
  // Source doc §5, Phase 9 Addendum C Part 1: set to `true` only when
  // admin-initiated creation (lib/platform/organizations/create.ts) tried
  // to assign an initial plan in the same flow and that specific attempt
  // failed — never set for the many pre-existing organisations created
  // before plan-at-creation existed, so it means "a plan assignment was
  // attempted and failed," not "no plan is assigned" (those are different
  // things — the latter is the normal, common tier-fallback state
  // lib/platform/entitlements/resolve.ts already handles). Cleared by the
  // next successful assignPlan() call, from any source.
  planAssignmentPending?: boolean;
  settings: {
    logo?: string;
    themeColor?: string;
    timezone?: string;
    currency?: string;
    country?: string;
    state?: string;
    industry?: string;
    isGstRegistered?: boolean;
    gstin?: string; // Additive — Sales invoice seller block
    // Additive — source doc §5's "Tax Jurisdiction" required-information
    // field (Phase 9 Addendum C Part 1). Defaults from country at creation
    // time (lib/constants/countries.ts::taxJurisdictionLabel), admin-
    // overridable — a label, not a real tax-calculation jurisdiction code,
    // since no tax engine exists in this codebase to key off of one.
    taxJurisdiction?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    pincode?: string;
    enabledModules?: string[];
    // Per-workspace AI preferences
    ai?: {
      model?: string;
      maxTokensPerCall?: number;
      disabled?: boolean;
      // Multilingual (Sarvam) layer — additive; absent/false = layer ON when configured.
      multilingualDisabled?: boolean;
      // AI create flow: execute-and-redirect instead of prefill-and-open-form. Default off.
      autoCreateEnabled?: boolean;
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
    // ── Global Admin control plane additions (Phase 2) ──────────────────────
    status: { type: String, enum: ORGANIZATION_STATUS_VALUES },
    organizationType: { type: String, enum: ORGANIZATION_TYPE_VALUES },
    region: { type: String, trim: true },
    planAssignmentPending: { type: Boolean, default: false },
    settings: {
      logo: { type: String },
      themeColor: { type: String, default: "#3b82f6" },
      timezone: { type: String, default: "UTC" },
      currency: { type: String, default: "USD" },
      country: { type: String },
      state: { type: String },
      industry: { type: String },
      isGstRegistered: { type: Boolean, default: false },
      gstin: { type: String, trim: true, uppercase: true },
      taxJurisdiction: { type: String, trim: true },
      addressLine1: { type: String },
      addressLine2: { type: String },
      city: { type: String },
      pincode: { type: String },
      enabledModules: { type: [String], default: [] },
      // Per-workspace AI preferences (Phase 2 — Step 7; Azure OpenAI migration Phase 0)
      // `model` is an Azure OpenAI deployment name override. No schema-level
      // default is set deliberately — deployment names are environment-specific,
      // unlike Anthropic's universal public model IDs. When unset, lib/ai/tenantAi.ts
      // falls back to CLAUDE_DEFAULT_MODEL (AZURE_OPENAI_CHAT_DEPLOYMENT).
      ai: {
        model: { type: String },
        maxTokensPerCall: { type: Number, default: 1024 },
        disabled: { type: Boolean, default: false },
        multilingualDisabled: { type: Boolean, default: false },
        autoCreateEnabled: { type: Boolean, default: false },
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
OrganizationSchema.index({ status: 1 });
OrganizationSchema.index({ organizationType: 1 });

const Organization: Model<IOrganization> =
  (mongoose.models.Organization as Model<IOrganization>) ||
  mongoose.model<IOrganization>("Organization", OrganizationSchema);

export default Organization;

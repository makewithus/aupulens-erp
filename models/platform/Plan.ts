import mongoose, { Schema, Document, Model } from "mongoose";
import {
  BILLING_CYCLE_VALUES,
  PLAN_KEY_VALUES,
  SUPPORT_LEVEL_VALUES,
  BillingCycle,
  PlanKeyType,
  SupportLevel,
} from "@/lib/constants/statuses";

/**
 * Source doc §8. Plans are configuration, never code (Hard Rule 6) — no
 * `if (plan === "PRO")` anywhere in application logic; every plan-aware
 * decision reads through lib/platform/entitlements/resolve.ts, which reads
 * this model. Custom enterprise plans (§11) set `isCustom: true` and
 * `basedOnPlanKey`, layering `OrganizationEntitlement.overrides` on top —
 * never a full duplicate of another plan's feature set.
 */
export interface IPlanFeatures {
  modules: string[];
  maxUsers: number;
  maxCompanies: number;
  storageGb: number;
  apiRequestsPerMonth: number;
  aiCreditsPerMonth: number;
  aiRequestsPerMonth: number;
  automationRunsPerMonth: number;
  documentLimitPerMonth: number;
  supportLevel: SupportLevel;
  featureFlags: Record<string, boolean>;
}

export interface IPlan extends Document {
  key: PlanKeyType;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  billingCycleOptions: BillingCycle[];
  isCustom: boolean;
  basedOnPlanKey?: PlanKeyType;
  features: IPlanFeatures;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlanFeaturesSchema = new Schema<IPlanFeatures>(
  {
    modules: { type: [String], default: [] },
    maxUsers: { type: Number, required: true },
    maxCompanies: { type: Number, required: true, default: 1 },
    storageGb: { type: Number, required: true },
    apiRequestsPerMonth: { type: Number, required: true },
    aiCreditsPerMonth: { type: Number, required: true },
    aiRequestsPerMonth: { type: Number, required: true },
    automationRunsPerMonth: { type: Number, required: true },
    documentLimitPerMonth: { type: Number, required: true },
    supportLevel: { type: String, enum: SUPPORT_LEVEL_VALUES, required: true },
    featureFlags: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const PlanSchema = new Schema<IPlan>(
  {
    key: { type: String, required: true, unique: true, enum: PLAN_KEY_VALUES },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    priceMonthly: { type: Number, required: true, default: 0 },
    priceYearly: { type: Number, required: true, default: 0 },
    billingCycleOptions: { type: [String], enum: BILLING_CYCLE_VALUES, default: ["monthly"] },
    isCustom: { type: Boolean, default: false },
    basedOnPlanKey: { type: String, enum: PLAN_KEY_VALUES },
    features: { type: PlanFeaturesSchema, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default (mongoose.models.Plan as Model<IPlan>) ||
  mongoose.model<IPlan>("Plan", PlanSchema);

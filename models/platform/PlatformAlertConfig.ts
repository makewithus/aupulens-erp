import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Source doc §28, Phase 9 Addendum C Part 3: thresholds for the 4 newly
 * built alert conditions must be configurable, never hardcoded in the
 * checking logic (Hard Rule 6's same principle applied to alerting, not
 * just entitlements). A single singleton document — these are platform-wide
 * policy, not per-tenant (a failed-login spike or a permission-failure
 * spree is about an ADMIN actor, not a tenant). `findOneAndUpdate` with
 * `{singleton: true}` as the query is the standard idiom for "there is
 * exactly one of these" without inventing a fixed ObjectId to hardcode.
 */
export interface IPlatformAlertConfig extends Document {
  singleton: true;
  // Consecutive failures — reuses AdminUser's own existing failedLoginCount
  // counter (app/api/platform/auth/login/route.ts), which already resets to
  // 0 on a successful login, so no separate rolling time window is needed
  // here.
  failedLoginThreshold: number;
  permissionFailureThreshold: number;
  permissionFailureWindowMinutes: number;
  // A downgrade counts as "large" per source doc §28's own example framing
  // ("large subscription downgrade") when the plan-rank drop is at least
  // this many tiers, OR the FROM plan was at/above largeDowngradeFromRank.
  largeDowngradeTierDrop: number;
  // AI cost spike: today's cost vs. the trailing average of the preceding N
  // days, expressed as a multiplier (2.5 = "2.5x the trailing average").
  aiCostSpikeMultiplier: number;
  aiCostSpikeTrailingDays: number;
  // Phase 11 Part 1.7 — a single bulk export whose record count is at or
  // above this is "mass" (source doc §28's own wording). One export, not a
  // rolling window — there is no sustained-condition shape here the way
  // failed logins or permission failures have.
  massExportRecordThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformAlertConfigSchema = new Schema<IPlatformAlertConfig>(
  {
    singleton: { type: Boolean, required: true, default: true, unique: true },
    failedLoginThreshold: { type: Number, required: true, default: 5 },
    permissionFailureThreshold: { type: Number, required: true, default: 10 },
    permissionFailureWindowMinutes: { type: Number, required: true, default: 60 },
    largeDowngradeTierDrop: { type: Number, required: true, default: 2 },
    aiCostSpikeMultiplier: { type: Number, required: true, default: 3 },
    aiCostSpikeTrailingDays: { type: Number, required: true, default: 7 },
    massExportRecordThreshold: { type: Number, required: true, default: 1000 },
  },
  { timestamps: true },
);

export default (mongoose.models.PlatformAlertConfig as Model<IPlatformAlertConfig>) ||
  mongoose.model<IPlatformAlertConfig>("PlatformAlertConfig", PlatformAlertConfigSchema);

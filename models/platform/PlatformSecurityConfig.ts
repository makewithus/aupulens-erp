import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Phase 11 Part 1.6 — Security Configuration. Singleton, same idiom as
 * `PlatformAlertConfig` (a dedicated small config model per settings
 * domain, rather than one grab-bag "settings" document or a hardcoded
 * constant read at runtime). Kept separate from `PlatformAlertConfig`
 * despite both being "security configuration" in the loose sense — alert
 * thresholds and session policy are different concerns with different
 * change cadences, and this project's own established pattern (this model,
 * PlatformAlertConfig, RetentionPolicy) is one config model per domain, not
 * one shared catch-all.
 */
export interface IPlatformSecurityConfig extends Document {
  singleton: true;
  // Was a hardcoded constant (ADMIN_SESSION_MAX_AGE_SECONDS, 8h) in
  // lib/platform/auth/adminSessionEdge.ts — that file must stay Mongoose-
  // free (Edge runtime), so only the Node-only session-creation path
  // (lib/platform/auth/adminSession.ts::createAdminSession()) reads this;
  // the Edge-side JWT verification never needs to know the duration, only
  // to check the `exp` claim already baked into a token at signing time.
  sessionTimeoutHours: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformSecurityConfigSchema = new Schema<IPlatformSecurityConfig>(
  {
    singleton: { type: Boolean, required: true, default: true, unique: true },
    sessionTimeoutHours: { type: Number, required: true, default: 8, min: 1, max: 24 * 7 },
  },
  { timestamps: true },
);

export default (mongoose.models.PlatformSecurityConfig as Model<IPlatformSecurityConfig>) ||
  mongoose.model<IPlatformSecurityConfig>("PlatformSecurityConfig", PlatformSecurityConfigSchema);

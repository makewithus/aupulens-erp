import mongoose, { Schema, Document, Model } from "mongoose";
import { AI_AT_LIMIT_BEHAVIOR, AI_AT_LIMIT_BEHAVIOR_VALUES, AiAtLimitBehavior } from "@/lib/constants/statuses";

/**
 * Source doc §15/§16. **Absent row = exactly today's pre-Phase-4 behaviour**
 * (BLOCK at the pre-existing tier cap in lib/constants/tiers.ts) — Hard
 * Rule: "keeping BLOCK as the default so nothing changes for existing
 * tenants until an admin changes it." All limit fields are optional
 * overrides of the tier cap, never a replacement for it by default.
 */
export interface IAiLimit extends Document {
  tenantId: string;
  monthlyCreditsUsd?: number;
  dailyCreditsUsd?: number;
  maxRequestsPerMonth?: number;
  maxTokensPerMonth?: number;
  maxCostUsdPerMonth?: number;
  atLimitBehavior: AiAtLimitBehavior;
  createdAt: Date;
  updatedAt: Date;
}

const AiLimitSchema = new Schema<IAiLimit>(
  {
    tenantId: { type: String, required: true, unique: true },
    monthlyCreditsUsd: { type: Number },
    dailyCreditsUsd: { type: Number },
    maxRequestsPerMonth: { type: Number },
    maxTokensPerMonth: { type: Number },
    maxCostUsdPerMonth: { type: Number },
    atLimitBehavior: {
      type: String,
      required: true,
      enum: AI_AT_LIMIT_BEHAVIOR_VALUES,
      default: AI_AT_LIMIT_BEHAVIOR.BLOCK,
    },
  },
  { timestamps: true },
);

export default (mongoose.models.AiLimit as Model<IAiLimit>) ||
  mongoose.model<IAiLimit>("AiLimit", AiLimitSchema);

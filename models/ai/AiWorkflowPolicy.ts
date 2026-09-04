import mongoose, { Schema, Document, Model } from "mongoose";
import {
  AI_AUTONOMY_LEVEL_VALUES,
  AI_AUTONOMY_LEVEL,
  type AiAutonomyLevel,
} from "@/lib/constants/statuses";

/**
 * Per-tenant, per-workflow autonomy/threshold/kill-switch settings (Part 2.3).
 *
 * There is no seed data for this collection — a missing row is treated as
 * `killSwitchEnabled: false` (fail closed) by
 * lib/aiRuntime/runtime/killSwitch.ts, matching Hard Rule 6 ("default OFF in
 * production until validated") without requiring every future workflow to
 * remember to seed one. This is intentionally separate from the pre-existing
 * `Organization.settings.ai.disabled` (a blunt, tenant-wide "AI on/off" flag
 * used by lib/ai/tenantAi.ts for chat features) — that flag does not, and
 * should not, gate per-workflow autonomy; the two are unrelated switches.
 */

export interface IAiWorkflowPolicy extends Document {
  tenantId: string;
  workflowId: string;
  maxAutonomyLevel: AiAutonomyLevel;
  killSwitchEnabled: boolean;
  confidenceThreshold: number;
  materialityThreshold?: number;
  historicalStabilityThreshold: number;
  /** docs/ai/BRIEF-03-BATCH-B.md A.3 — default false. When true, mechanical schedule
   *  executions (prepaid recognition, depreciation) may reach `post_journal` at
   *  CONTROLLED_AUTONOMOUS. Nothing else this batch is affected by this flag — it is
   *  narrowly scoped to schedule postings, not a general autonomy override. */
  autoPostSchedules: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AiWorkflowPolicySchema: Schema<IAiWorkflowPolicy> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true },
    maxAutonomyLevel: {
      type: String,
      enum: AI_AUTONOMY_LEVEL_VALUES,
      default: AI_AUTONOMY_LEVEL.RECOMMEND,
    },
    killSwitchEnabled: { type: Boolean, default: false },
    confidenceThreshold: { type: Number, default: 0.85, min: 0, max: 1 },
    materialityThreshold: { type: Number },
    historicalStabilityThreshold: { type: Number, default: 0.9, min: 0, max: 1 },
    autoPostSchedules: { type: Boolean, default: false },
  },
  { timestamps: true },
);

AiWorkflowPolicySchema.index({ tenantId: 1, workflowId: 1 }, { unique: true });

const AiWorkflowPolicy: Model<IAiWorkflowPolicy> =
  (mongoose.models.AiWorkflowPolicy as Model<IAiWorkflowPolicy>) ||
  mongoose.model<IAiWorkflowPolicy>("AiWorkflowPolicy", AiWorkflowPolicySchema);

export default AiWorkflowPolicy;

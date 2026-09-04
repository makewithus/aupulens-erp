import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-30's repair audit trail (docs/ai/BRIEF-08a-BATCH-G.md A.5) — one row per repair ATTEMPT,
 * never overwritten. This is what makes "audited with before/after state," "retry cap with
 * exponential backoff," and "a repair that fails twice escalates and is never retried" real,
 * checkable properties instead of promises: `lib/aiRuntime/opsHealth/repairGate.ts` reads this
 * collection before every repair attempt to decide retry vs. escalate vs. wait-for-backoff.
 */

export type OpsRepairOutcome = "success" | "failed" | "escalated";
export type OpsRepairType = "requeue_dead_letter" | "retry_integration_connection" | "refresh_tax_projection" | "relink_orphan";

export interface IAiOperationsRepairLog extends Document {
  tenantId: string;
  issueKey: string; // stable identity for the underlying issue, e.g. `AiEvent:<id>`
  repairType: OpsRepairType;
  attempt: number;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown> | null;
  outcome: OpsRepairOutcome;
  error?: string;
  createdAt: Date;
}

const AiOperationsRepairLogSchema: Schema<IAiOperationsRepairLog> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    issueKey: { type: String, required: true, index: true },
    repairType: { type: String, enum: ["requeue_dead_letter", "retry_integration_connection", "refresh_tax_projection", "relink_orphan"], required: true },
    attempt: { type: Number, required: true },
    beforeState: { type: Schema.Types.Mixed, default: {} },
    afterState: { type: Schema.Types.Mixed, default: null },
    outcome: { type: String, enum: ["success", "failed", "escalated"], required: true },
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AiOperationsRepairLogSchema.index({ tenantId: 1, issueKey: 1, createdAt: -1 });

const AiOperationsRepairLog: Model<IAiOperationsRepairLog> =
  (mongoose.models.AiOperationsRepairLog as Model<IAiOperationsRepairLog>) || mongoose.model<IAiOperationsRepairLog>("AiOperationsRepairLog", AiOperationsRepairLogSchema);

export default AiOperationsRepairLog;

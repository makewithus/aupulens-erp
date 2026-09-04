import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-30's persisted health-sweep findings (docs/ai/BRIEF-08a-BATCH-G.md, AI-30 expected output) —
 * one row per run, same shape/precedent as `AiInventoryFinding`/`AiDuplicateFinding`/`AiPolicyFinding`.
 */

export interface IAiOperationsFinding extends Document {
  tenantId: string;
  runId: mongoose.Types.ObjectId;
  healthByModule: unknown[];
  healthByIntegration: unknown[];
  issues: unknown[];
  repairsAttempted: unknown[];
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiOperationsFindingSchema: Schema<IAiOperationsFinding> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    healthByModule: { type: [Schema.Types.Mixed], default: [] },
    healthByIntegration: { type: [Schema.Types.Mixed], default: [] },
    issues: { type: [Schema.Types.Mixed], default: [] },
    repairsAttempted: { type: [Schema.Types.Mixed], default: [] },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiOperationsFindingSchema.index({ tenantId: 1, createdAt: -1 });

const AiOperationsFinding: Model<IAiOperationsFinding> =
  (mongoose.models.AiOperationsFinding as Model<IAiOperationsFinding>) || mongoose.model<IAiOperationsFinding>("AiOperationsFinding", AiOperationsFindingSchema);

export default AiOperationsFinding;

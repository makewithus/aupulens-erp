import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-26's persisted findings (docs/ai/BRIEF-08a-BATCH-G.md, AI-26 expected output) — one row per
 * run, same shape/precedent as `AiInventoryFinding`/`AiDuplicateFinding`.
 */

export interface IAiPolicyFinding extends Document {
  tenantId: string;
  runId: mongoose.Types.ObjectId;
  policies: unknown[];
  treatmentVerdicts: unknown[];
  inconsistencies: unknown[];
  policyGaps: unknown[];
  impactOfChange: unknown[];
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiPolicyFindingSchema: Schema<IAiPolicyFinding> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    policies: { type: [Schema.Types.Mixed], default: [] },
    treatmentVerdicts: { type: [Schema.Types.Mixed], default: [] },
    inconsistencies: { type: [Schema.Types.Mixed], default: [] },
    policyGaps: { type: [Schema.Types.Mixed], default: [] },
    impactOfChange: { type: [Schema.Types.Mixed], default: [] },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiPolicyFindingSchema.index({ tenantId: 1, createdAt: -1 });

const AiPolicyFinding: Model<IAiPolicyFinding> =
  (mongoose.models.AiPolicyFinding as Model<IAiPolicyFinding>) || mongoose.model<IAiPolicyFinding>("AiPolicyFinding", AiPolicyFindingSchema);

export default AiPolicyFinding;

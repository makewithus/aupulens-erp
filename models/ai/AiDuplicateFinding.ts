import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-27's persisted duplicate/duplicate-payment findings (docs/ai/BRIEF-08a-BATCH-G.md, AI-27
 * expected output). One row per run — a run either reacts to a single new document (`candidates`
 * scoped to that document) or is the tenant-wide retrospective sweep (`retrospective` populated).
 */

export interface IAiDuplicateFinding extends Document {
  tenantId: string;
  runId: mongoose.Types.ObjectId;
  candidates: unknown[];
  duplicatePayments: unknown[];
  retrospective: unknown | null;
  checksNotImplemented: { what: string; reason: string }[];
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiDuplicateFindingSchema: Schema<IAiDuplicateFinding> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    candidates: { type: [Schema.Types.Mixed], default: [] },
    duplicatePayments: { type: [Schema.Types.Mixed], default: [] },
    retrospective: { type: Schema.Types.Mixed, default: null },
    checksNotImplemented: [{ what: String, reason: String }],
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiDuplicateFindingSchema.index({ tenantId: 1, createdAt: -1 });

const AiDuplicateFinding: Model<IAiDuplicateFinding> =
  (mongoose.models.AiDuplicateFinding as Model<IAiDuplicateFinding>) || mongoose.model<IAiDuplicateFinding>("AiDuplicateFinding", AiDuplicateFindingSchema);

export default AiDuplicateFinding;

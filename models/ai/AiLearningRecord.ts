import mongoose, { Schema, Document, Model } from "mongoose";
import {
  AI_LEARNING_OUTCOME_VALUES,
  AI_LEARNING_OUTCOME,
  type AiLearningOutcome,
} from "@/lib/constants/statuses";

/**
 * The learning loop's shared outcome-capture store (Part 2.6). One row per
 * proposal a workflow made; `learningStore.recordOutcome()` is the only
 * writer. Never mutates any rule directly — aggregation into a "learned
 * mapping" is a separate, later, human-approved step (not built in this
 * chunk; no workflow exists yet to produce proposals worth aggregating).
 */

export interface IAiLearningRecord extends Document {
  tenantId: string;
  workflowId: string;
  runId: mongoose.Types.ObjectId;
  proposal: Record<string, unknown>;
  contextRef?: string;
  outcome: AiLearningOutcome;
  editedValue?: Record<string, unknown>;
  userId?: mongoose.Types.ObjectId;
  downstreamResult?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiLearningRecordSchema: Schema<IAiLearningRecord> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    proposal: { type: Schema.Types.Mixed, default: {} },
    contextRef: { type: String },
    outcome: {
      type: String,
      enum: AI_LEARNING_OUTCOME_VALUES,
      default: AI_LEARNING_OUTCOME.PENDING,
    },
    editedValue: { type: Schema.Types.Mixed },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    downstreamResult: { type: String },
  },
  { timestamps: true },
);

AiLearningRecordSchema.index({ tenantId: 1, workflowId: 1, createdAt: -1 });
// Chunk 9 (0.1) — structurally enforces "a run that produces a proposal produces exactly one
// learning record": a genuine second recordProposal() call for the same run now fails at the DB
// layer instead of silently creating a duplicate (the real bug found in AI-07's own
// record_learning_outcome tool call, which used to call recordProposal a second time for a run
// the executor's own `learn` stage had already recorded).
AiLearningRecordSchema.index({ runId: 1 }, { unique: true });

const AiLearningRecord: Model<IAiLearningRecord> =
  (mongoose.models.AiLearningRecord as Model<IAiLearningRecord>) ||
  mongoose.model<IAiLearningRecord>("AiLearningRecord", AiLearningRecordSchema);

export default AiLearningRecord;

import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Nightly per-workflow metric snapshot (docs/ai/BRIEF-08b-FINAL.md C.1). One row per
 * `{tenantId, workflowId, snapshotDate}` — a real history, not a single mutable "current value"
 * row, so a trend/drift comparison (C.4) has something to compare against.
 *
 * Every metric here is computed from data this system already has (`AiLearningRecord`,
 * `AiWorkflowRun`, `AiAttentionItem`, `AiDetectorHealth`) — never invented. A metric with no real
 * data source for a given workflow is `null`, with the reason in `notComputable`, not a guessed
 * number (the same honesty discipline as every `not_implemented` declaration elsewhere in this
 * project).
 */

export interface IAiMetricSnapshot extends Document {
  tenantId: string;
  workflowId: string;
  snapshotDate: Date;
  metrics: {
    overrideRate: number | null;
    overrideSampleSize: number;
    automationCoverage: number | null;
    exceptionResolutionHoursAvg: number | null;
    exceptionResolutionSampleSize: number;
    policyOverrideCount: number;
    falseMatchRate: number | null; // from AiDetectorHealth.precision where applicable
    detectorSampleSize: number;
    runCount: number;
    autonomyApplied: string | null; // most common autonomyApplied this window
  };
  notComputable: { what: string; reason: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const AiMetricSnapshotSchema: Schema<IAiMetricSnapshot> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true },
    snapshotDate: { type: Date, required: true },
    metrics: {
      overrideRate: { type: Number, default: null },
      overrideSampleSize: { type: Number, default: 0 },
      automationCoverage: { type: Number, default: null },
      exceptionResolutionHoursAvg: { type: Number, default: null },
      exceptionResolutionSampleSize: { type: Number, default: 0 },
      policyOverrideCount: { type: Number, default: 0 },
      falseMatchRate: { type: Number, default: null },
      detectorSampleSize: { type: Number, default: 0 },
      runCount: { type: Number, default: 0 },
      autonomyApplied: { type: String, default: null },
    },
    notComputable: [{ what: String, reason: String }],
  },
  { timestamps: true },
);

AiMetricSnapshotSchema.index({ tenantId: 1, workflowId: 1, snapshotDate: -1 }, { unique: true });

const AiMetricSnapshot: Model<IAiMetricSnapshot> =
  (mongoose.models.AiMetricSnapshot as Model<IAiMetricSnapshot>) || mongoose.model<IAiMetricSnapshot>("AiMetricSnapshot", AiMetricSnapshotSchema);

export default AiMetricSnapshot;

import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-15's anomaly record (docs/ai/BRIEF-05-BATCH-D.md A.5) — an investigation, never a
 * correction: what was observed, what normal looks like, how far this deviates, and what a
 * human should check. `status` starts `open`; a human (or a future review surface) moves it to
 * `confirmed`/`dismissed` via `confirm_anomaly`/`dismiss_anomaly`, which is what feeds
 * `AiDetectorHealth`'s precision. `suppressed` is set by `suppress_anomaly` and prevents further
 * anomalies with the same `{detectorId, suppressionKey}` from being raised until the window
 * expires (`AiAnomalySuppression`).
 */

export const AI_ANOMALY_STATUS = {
  OPEN: "open",
  CONFIRMED: "confirmed",
  DISMISSED: "dismissed",
} as const;
export type AiAnomalyStatus = (typeof AI_ANOMALY_STATUS)[keyof typeof AI_ANOMALY_STATUS];

export interface IAiAnomaly extends Document {
  tenantId: string;
  detectorId: string;
  runId: mongoose.Types.ObjectId;
  severity: "critical" | "high" | "medium" | "low" | "info";
  subjectRefs: { model: string; id: string }[];
  observed: string;
  expectedRange: string;
  deviation: string;
  historicalBasis: string;
  evidence: { kind: string; ref: string; label: string }[];
  suggestedChecks: string[];
  suppressionKey: string;
  silent: boolean;
  status: AiAnomalyStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AiAnomalySchema: Schema<IAiAnomaly> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    detectorId: { type: String, required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    severity: { type: String, enum: ["critical", "high", "medium", "low", "info"], required: true },
    subjectRefs: { type: [{ model: String, id: String }], default: [] },
    observed: { type: String, required: true },
    expectedRange: { type: String, required: true },
    deviation: { type: String, required: true },
    historicalBasis: { type: String, required: true },
    evidence: { type: [{ kind: String, ref: String, label: String }], default: [] },
    suggestedChecks: { type: [String], default: [] },
    suppressionKey: { type: String, required: true },
    silent: { type: Boolean, default: true },
    status: { type: String, enum: Object.values(AI_ANOMALY_STATUS), default: AI_ANOMALY_STATUS.OPEN },
  },
  { timestamps: true },
);

AiAnomalySchema.index({ tenantId: 1, detectorId: 1, suppressionKey: 1, createdAt: -1 });

const AiAnomaly: Model<IAiAnomaly> =
  (mongoose.models.AiAnomaly as Model<IAiAnomaly>) || mongoose.model<IAiAnomaly>("AiAnomaly", AiAnomalySchema);

export default AiAnomaly;

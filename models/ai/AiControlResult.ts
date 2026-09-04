import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-29's persisted per-control-per-period test result (docs/ai/BRIEF-07-BATCH-F.md, AI-29) — the
 * trend/history a `design_concern` verdict is derived from. One row per `{tenantId, controlId,
 * period}`, upserted on every run — the same dedupe shape as `AiCloseAssertion`/`AiEvidencePack`.
 */

export interface IAiControlException {
  ref: string;
  detail: string;
  severity: string;
  evidence: { kind: string; ref: string; label: string }[];
  owner: string;
  status: "open";
}

export interface IAiControlResult extends Document {
  tenantId: string;
  controlId: string;
  period: string;
  status: "implemented" | "not_implemented" | "partial";
  reasonIfLimited?: string;
  populationSize: number;
  tested: number;
  passed: number;
  failed: number;
  failureRate: number;
  exceptions: IAiControlException[];
  designConcern: boolean;
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiControlResultSchema: Schema<IAiControlResult> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    controlId: { type: String, required: true },
    period: { type: String, required: true },
    status: { type: String, enum: ["implemented", "not_implemented", "partial"], required: true },
    reasonIfLimited: { type: String },
    populationSize: { type: Number, default: 0 },
    tested: { type: Number, default: 0 },
    passed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    failureRate: { type: Number, default: 0 },
    exceptions: { type: [{ ref: String, detail: String, severity: String, evidence: [{ kind: String, ref: String, label: String }], owner: String, status: String }], default: [] },
    designConcern: { type: Boolean, default: false },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiControlResultSchema.index({ tenantId: 1, controlId: 1, period: 1 }, { unique: true });

const AiControlResult: Model<IAiControlResult> =
  (mongoose.models.AiControlResult as Model<IAiControlResult>) || mongoose.model<IAiControlResult>("AiControlResult", AiControlResultSchema);

export default AiControlResult;

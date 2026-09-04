import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-24's machine-verifiable close-item assertions (docs/ai/BRIEF-04-BATCH-C.md, AI-24) — first-
 * class, inspectable records rather than predicates buried in code. One row per
 * `{tenantId, period, item}`, upserted on every evaluation sweep so a nightly re-run updates the
 * same row instead of generating duplicates — the dedupe mechanism the brief calls out as the
 * failure mode "most likely to make users disable the whole feature."
 */

export interface IAiCloseAssertion extends Document {
  tenantId: string;
  period: string; // "YYYY-MM"
  item: string; // e.g. "bank_reconciled", "accruals_posted"
  assertionId: string;
  assertionDescription: string;
  verified: boolean;
  evidence: { kind: string; ref: string; label: string }[];
  missing: string[];
  owner?: string;
  requestTaskId?: string;
  evaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiCloseAssertionSchema: Schema<IAiCloseAssertion> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    period: { type: String, required: true },
    item: { type: String, required: true },
    assertionId: { type: String, required: true },
    assertionDescription: { type: String, required: true },
    verified: { type: Boolean, required: true },
    evidence: [{ kind: String, ref: String, label: String }],
    missing: [{ type: String }],
    owner: { type: String },
    requestTaskId: { type: String },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiCloseAssertionSchema.index({ tenantId: 1, period: 1, item: 1 }, { unique: true });

const AiCloseAssertion: Model<IAiCloseAssertion> =
  (mongoose.models.AiCloseAssertion as Model<IAiCloseAssertion>) ||
  mongoose.model<IAiCloseAssertion>("AiCloseAssertion", AiCloseAssertionSchema);

export default AiCloseAssertion;

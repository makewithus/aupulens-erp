import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-18's persisted evidence pack (docs/ai/BRIEF-07-BATCH-F.md, AI-18 algorithm step 2) — "For a
 * balance or a period: the figures, the supporting records, the attached documents, the
 * approvals, and the reconciliation results from AI-22 that support it. Persist... so it is
 * reproducible and citable later." One row per `{tenantId, packId}` — a real, inspectable record
 * an auditor can be handed a reference to, not a value recomputed and discarded on every read.
 */

export interface IAiCitation {
  model: string;
  id: string;
  label: string;
  url?: string;
}

export interface IAiClaim {
  claim_text: string;
  citations: IAiCitation[];
}

export interface IAiEvidencePack extends Document {
  tenantId: string;
  packId: string;
  scope: { type: "account_period" | "period_sweep"; accountId?: string; period: string };
  figures: IAiClaim[];
  documents: IAiClaim[];
  approvals: IAiClaim[];
  reconciliations: IAiClaim[];
  decisionTraces: IAiClaim[];
  missingEvidence: { subjectRef: { model: string; id: string }; what: string }[];
  completenessScore: number;
  sample?: { method: string; seed: string; items: string[] };
  createdAt: Date;
  updatedAt: Date;
}

const CitationSchema = new Schema<IAiCitation>({ model: String, id: String, label: String, url: String }, { _id: false });
const ClaimSchema = new Schema<IAiClaim>({ claim_text: String, citations: [CitationSchema] }, { _id: false });

const AiEvidencePackSchema: Schema<IAiEvidencePack> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    packId: { type: String, required: true },
    scope: {
      type: { type: String, enum: ["account_period", "period_sweep"], required: true },
      accountId: { type: String },
      period: { type: String, required: true },
    },
    figures: { type: [ClaimSchema], default: [] },
    documents: { type: [ClaimSchema], default: [] },
    approvals: { type: [ClaimSchema], default: [] },
    reconciliations: { type: [ClaimSchema], default: [] },
    decisionTraces: { type: [ClaimSchema], default: [] },
    missingEvidence: { type: [{ subjectRef: { model: String, id: String }, what: String }], default: [] },
    completenessScore: { type: Number, required: true },
    sample: { method: { type: String }, seed: { type: String }, items: { type: [String] } },
  },
  { timestamps: true },
);

AiEvidencePackSchema.index({ tenantId: 1, packId: 1 }, { unique: true });

const AiEvidencePack: Model<IAiEvidencePack> =
  (mongoose.models.AiEvidencePack as Model<IAiEvidencePack>) || mongoose.model<IAiEvidencePack>("AiEvidencePack", AiEvidencePackSchema);

export default AiEvidencePack;

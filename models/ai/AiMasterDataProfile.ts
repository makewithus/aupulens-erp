import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-19's observed master-data intelligence (docs/ai/BRIEF-08a-BATCH-G.md A.2) — what the AI has
 * *observed* about one vendor/customer/item, never a mutation of the record itself. One row per
 * `{tenantId, entityModel, recordId}`, upserted on every sweep. **No workflow writes to `Vendor`,
 * `Customer`, `Employee`, `Product` or `InventoryItem`** — this is the only place AI-19's findings
 * live.
 */

export interface IAiObservedPaymentTerms {
  netDays: number;
  discountPercent?: number;
  discountDays?: number;
  sampleSize: number;
  evidence: { kind: string; ref: string; label: string }[];
}

export interface IAiDuplicateCandidate {
  recordId: string;
  model: string;
  score: number;
  classification: "certain" | "probable" | "possible";
  matchedOn: string[];
  proposedSurvivor: string;
}

export interface IAiBankChangeAlert {
  field: string;
  oldMasked: string;
  newMasked: string;
  changedAt: Date;
  riskFactors: string[];
  holdPlaced: boolean;
  holdRef?: string;
}

export interface IAiMasterDataProfile extends Document {
  tenantId: string;
  entityModel: string;
  recordId: string;
  missingFields: string[];
  duplicateCandidates: IAiDuplicateCandidate[];
  bankChangeAlerts: IAiBankChangeAlert[];
  employeeCollisions: { employeeId: string; matchedOn: string[] }[];
  observedPaymentTerms?: IAiObservedPaymentTerms;
  expiringDocuments: { docType: string; expiresAt: Date }[];
  lastEvaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiMasterDataProfileSchema: Schema<IAiMasterDataProfile> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    entityModel: { type: String, required: true },
    recordId: { type: String, required: true },
    missingFields: { type: [String], default: [] },
    duplicateCandidates: {
      type: [{ recordId: String, model: String, score: Number, classification: String, matchedOn: [String], proposedSurvivor: String }],
      default: [],
    },
    bankChangeAlerts: {
      type: [{ field: String, oldMasked: String, newMasked: String, changedAt: Date, riskFactors: [String], holdPlaced: Boolean, holdRef: String }],
      default: [],
    },
    employeeCollisions: { type: [{ employeeId: String, matchedOn: [String] }], default: [] },
    observedPaymentTerms: {
      netDays: Number,
      discountPercent: Number,
      discountDays: Number,
      sampleSize: Number,
      evidence: [{ kind: String, ref: String, label: String }],
    },
    expiringDocuments: { type: [{ docType: String, expiresAt: Date }], default: [] },
    lastEvaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

AiMasterDataProfileSchema.index({ tenantId: 1, entityModel: 1, recordId: 1 }, { unique: true });

const AiMasterDataProfile: Model<IAiMasterDataProfile> =
  (mongoose.models.AiMasterDataProfile as Model<IAiMasterDataProfile>) || mongoose.model<IAiMasterDataProfile>("AiMasterDataProfile", AiMasterDataProfileSchema);

export default AiMasterDataProfile;

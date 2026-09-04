import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * The tenant's real compliance registrations, filing obligations, and thresholds
 * (docs/ai/BRIEF-06-BATCH-E.md A.2) — one shared model for AI-12 (needs registrations) and AI-17
 * (needs obligations), rather than two half-models.
 *
 * **Human-entered, AI structurally read-only** — the one `models/ai/**` model no workflow may
 * write. No `internal_state` tool registers a write for it anywhere (a source-grep test asserts
 * this). Surfaced as a plain form on the Policy tab. An empty/missing profile means AI-12 and
 * AI-17 report `not_configured` and produce zero obligations — never an assumed GST-monthly
 * default (the same "absent policy, no invented default" precedent as `AiExpensePolicy` and
 * `AiMaterialityPolicy`).
 */

export const AI_COMPLIANCE_FREQUENCY = {
  MONTHLY: "monthly",
  QUARTERLY: "quarterly",
  ANNUAL: "annual",
} as const;
export type AiComplianceFrequency = (typeof AI_COMPLIANCE_FREQUENCY)[keyof typeof AI_COMPLIANCE_FREQUENCY];

export interface IAiComplianceRegistration {
  jurisdiction: string;
  taxType: string;
  registrationNumber: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export interface IAiComplianceObligation {
  jurisdiction: string;
  taxType: string;
  returnType: string; // drives which box set a workpaper uses (A.5) — never hard-coded per jurisdiction
  frequency: AiComplianceFrequency;
  dueDayOffset: number; // days after period end the return is due
  firstPeriod: string; // "YYYY-MM" — obligations don't exist before this period
  /** Days of advance warning before the deadline AI-17 should flag readiness risk from — A.4
   *  requires this configurable, defaulting generous (weeks, not days). */
  warningWindowDays?: number;
}

export interface IAiComplianceThreshold {
  jurisdiction: string;
  taxType: string;
  turnoverThreshold: number;
}

export interface IAiComplianceProfile extends Document {
  tenantId: string;
  registrations: IAiComplianceRegistration[];
  obligations: IAiComplianceObligation[];
  thresholds: IAiComplianceThreshold[];
  createdAt: Date;
  updatedAt: Date;
}

const AiComplianceProfileSchema: Schema<IAiComplianceProfile> = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    registrations: {
      type: [
        {
          jurisdiction: { type: String, required: true },
          taxType: { type: String, required: true },
          registrationNumber: { type: String, required: true },
          effectiveFrom: { type: Date, required: true },
          effectiveTo: { type: Date },
        },
      ],
      default: [],
    },
    obligations: {
      type: [
        {
          jurisdiction: { type: String, required: true },
          taxType: { type: String, required: true },
          returnType: { type: String, required: true },
          frequency: { type: String, enum: Object.values(AI_COMPLIANCE_FREQUENCY), required: true },
          dueDayOffset: { type: Number, required: true },
          firstPeriod: { type: String, required: true },
          warningWindowDays: { type: Number, default: 21 },
        },
      ],
      default: [],
    },
    thresholds: {
      type: [
        {
          jurisdiction: { type: String, required: true },
          taxType: { type: String, required: true },
          turnoverThreshold: { type: Number, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

const AiComplianceProfile: Model<IAiComplianceProfile> =
  (mongoose.models.AiComplianceProfile as Model<IAiComplianceProfile>) ||
  mongoose.model<IAiComplianceProfile>("AiComplianceProfile", AiComplianceProfileSchema);

export default AiComplianceProfile;

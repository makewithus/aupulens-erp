import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-12's tax ledger, built as a **rebuildable projection** (docs/ai/BRIEF-06-BATCH-E.md A.1) —
 * never an authoritative second source of tax truth. Every row is derived from tax amounts the
 * existing inline math (`lib/sales/invoiceMath.ts` and equivalent Finance-invoice logic) already
 * computed and stored on the source document; this collection only re-shapes that into something
 * queryable by period/jurisdiction. AI code never computes a tax figure here — see
 * `lib/aiRuntime/tax/rebuildTaxProjection.ts`, the only place these rows are written, and it only
 * ever reads what a source document already has.
 *
 * `projectionVersion` lets `rebuild(period)` replace an entire period's rows atomically-in-spirit
 * (delete-then-recreate under one version bump) without ever leaving a mixed-version period.
 */

export const AI_TAX_DIRECTION = {
  INPUT: "input", // input tax on purchases/expenses — reclaimable
  OUTPUT: "output", // output tax on sales — payable
} as const;
export type AiTaxDirection = (typeof AI_TAX_DIRECTION)[keyof typeof AI_TAX_DIRECTION];

export interface IAiTaxTransaction extends Document {
  tenantId: string;
  sourceRef: { model: string; id: mongoose.Types.ObjectId };
  direction: AiTaxDirection;
  jurisdiction: string | null; // null when unresolved — a finding, never guessed
  taxRateRef: mongoose.Types.ObjectId | null;
  taxType: string | null;
  counterpartyTaxRegistrationNumber: string | null;
  taxableAmount: number;
  taxAmount: number;
  documentDate: Date;
  periodKey: string; // "YYYY-MM"
  evidenceRefs: { kind: string; ref: string; label: string }[];
  projectedAt: Date;
  projectionVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const AiTaxTransactionSchema: Schema<IAiTaxTransaction> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    sourceRef: { model: { type: String, required: true }, id: { type: Schema.Types.ObjectId, required: true } },
    direction: { type: String, enum: Object.values(AI_TAX_DIRECTION), required: true },
    jurisdiction: { type: String, default: null },
    taxRateRef: { type: Schema.Types.ObjectId, ref: "TaxRate", default: null },
    taxType: { type: String, default: null },
    counterpartyTaxRegistrationNumber: { type: String, default: null },
    taxableAmount: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
    documentDate: { type: Date, required: true },
    periodKey: { type: String, required: true, index: true },
    evidenceRefs: { type: [{ kind: String, ref: String, label: String }], default: [] },
    projectedAt: { type: Date, required: true },
    projectionVersion: { type: Number, required: true, default: 1 },
  },
  { timestamps: true },
);

AiTaxTransactionSchema.index({ tenantId: 1, periodKey: 1, direction: 1 });
AiTaxTransactionSchema.index({ tenantId: 1, "sourceRef.model": 1, "sourceRef.id": 1 }, { unique: true });

const AiTaxTransaction: Model<IAiTaxTransaction> =
  (mongoose.models.AiTaxTransaction as Model<IAiTaxTransaction>) ||
  mongoose.model<IAiTaxTransaction>("AiTaxTransaction", AiTaxTransactionSchema);

export default AiTaxTransaction;

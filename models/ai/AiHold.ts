import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A durable payment/vendor hold (docs/ai/BRIEF-08a-BATCH-G.md A.1) — shared between AI-19 and
 * AI-27, both of which may only ever *place* one. **`place_hold` is the only write path anywhere
 * in the registry; there is no `release_hold` tool at any autonomy level** (asserted directly in
 * tests) — a human clears a hold, which is why this collection exists on its own rather than
 * being folded into `AiPaymentRunProposal` (a fresh, per-run document that wouldn't durably block
 * a *future* proposal the way a standing hold needs to).
 */

export const AI_HOLD_STATUS = {
  OPEN: "open",
  CLEARED: "cleared",
} as const;
export type AiHoldStatus = (typeof AI_HOLD_STATUS)[keyof typeof AI_HOLD_STATUS];

export interface IAiHold extends Document {
  tenantId: string;
  subjectRef: { model: string; id: string };
  reason: string;
  placedByWorkflow: string;
  placedAt: Date;
  status: AiHoldStatus;
  clearedBy?: mongoose.Types.ObjectId;
  clearedAt?: Date;
  clearNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiHoldSchema: Schema<IAiHold> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    subjectRef: { model: { type: String, required: true }, id: { type: String, required: true } },
    reason: { type: String, required: true },
    placedByWorkflow: { type: String, required: true },
    placedAt: { type: Date, required: true },
    status: { type: String, enum: Object.values(AI_HOLD_STATUS), default: AI_HOLD_STATUS.OPEN },
    clearedBy: { type: Schema.Types.ObjectId, ref: "User" },
    clearedAt: { type: Date },
    clearNote: { type: String },
  },
  { timestamps: true },
);

AiHoldSchema.index({ tenantId: 1, "subjectRef.model": 1, "subjectRef.id": 1, status: 1 });

const AiHold: Model<IAiHold> = (mongoose.models.AiHold as Model<IAiHold>) || mongoose.model<IAiHold>("AiHold", AiHoldSchema);

export default AiHold;

import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-05's dispute record (docs/ai/BRIEF-05-BATCH-D.md, AI-05 algorithm step 5) — opened when a
 * receipt looks like a deliberate short payment against a specific invoice, or another
 * dispute-shaped signal is detected. Its only behavioural effect elsewhere in the codebase is
 * `lib/sales/reminderEngine.ts::evaluateInvoiceReminders()` skipping any invoice with an OPEN
 * dispute here — "stop the reminder sequence for that invoice" per the brief, implemented as a
 * minimal additive guard in the real send path rather than a second reminder mechanism.
 *
 * `models/ai/**` scope — writes go through the `open_dispute`/`resolve_dispute` tools
 * (`lib/aiRuntime/tools/receivablesTools.ts`), tagged `internal_state` (Task 0.3).
 */

export const AI_DISPUTE_STATUS = {
  OPEN: "open",
  RESOLVED: "resolved",
} as const;
export type AiDisputeStatus = (typeof AI_DISPUTE_STATUS)[keyof typeof AI_DISPUTE_STATUS];

export interface IAiDispute extends Document {
  tenantId: string;
  workflowId: string;
  subjectModel: "SalesInvoice";
  subjectId: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  reason: string;
  detectedBasis: string;
  amount?: number;
  status: AiDisputeStatus;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiDisputeSchema: Schema<IAiDispute> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true },
    subjectModel: { type: String, required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    reason: { type: String, required: true },
    detectedBasis: { type: String, required: true },
    amount: { type: Number },
    status: { type: String, enum: Object.values(AI_DISPUTE_STATUS), default: AI_DISPUTE_STATUS.OPEN },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

AiDisputeSchema.index({ tenantId: 1, subjectModel: 1, subjectId: 1, status: 1 });

const AiDispute: Model<IAiDispute> =
  (mongoose.models.AiDispute as Model<IAiDispute>) || mongoose.model<IAiDispute>("AiDispute", AiDisputeSchema);

export default AiDispute;

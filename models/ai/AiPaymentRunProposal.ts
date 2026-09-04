import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * AI-06's payment-run proposal (docs/ai/BRIEF-05-BATCH-D.md A.3) — "no payment-run concept
 * exists anywhere in this codebase," so this is a NEW document type, not a wrapper around an
 * existing one. It is a grouped, prioritised list with exclusions and reasons — a document, not
 * an executable batch. **Nothing anywhere can turn this into a real payment**: no
 * "release"/"execute" tool exists for it in the tool registry, and this model carries no status
 * transition toward one. Payment release is `NEVER_AUTONOMOUS`, permanently.
 */

export interface IAiPaymentRunIncluded {
  billId: mongoose.Types.ObjectId;
  billNumber: string;
  vendorId: mongoose.Types.ObjectId;
  vendorName: string;
  currency: string;
  amount: number;
  dueDate: Date;
}

export interface IAiPaymentRunExcluded {
  billId: mongoose.Types.ObjectId;
  billNumber: string;
  reason: string;
}

export interface IAiPaymentRunTotal {
  currency: string;
  amount: number;
}

export interface IAiPaymentRunProposal extends Document {
  tenantId: string;
  workflowId: string;
  runId: mongoose.Types.ObjectId;
  included: IAiPaymentRunIncluded[];
  excluded: IAiPaymentRunExcluded[];
  totalsByCurrency: IAiPaymentRunTotal[];
  checksNotImplemented: { what: string; reason: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const AiPaymentRunProposalSchema: Schema<IAiPaymentRunProposal> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: String, required: true },
    runId: { type: Schema.Types.ObjectId, ref: "AiWorkflowRun", required: true },
    included: [
      {
        billId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
        billNumber: { type: String, required: true },
        vendorId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
        vendorName: { type: String, required: true },
        currency: { type: String, required: true },
        amount: { type: Number, required: true },
        dueDate: { type: Date, required: true },
      },
    ],
    excluded: [
      {
        billId: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
        billNumber: { type: String, required: true },
        reason: { type: String, required: true },
      },
    ],
    totalsByCurrency: [{ currency: String, amount: Number }],
    checksNotImplemented: [{ what: String, reason: String }],
  },
  { timestamps: true },
);

AiPaymentRunProposalSchema.index({ tenantId: 1, createdAt: -1 });

const AiPaymentRunProposal: Model<IAiPaymentRunProposal> =
  (mongoose.models.AiPaymentRunProposal as Model<IAiPaymentRunProposal>) ||
  mongoose.model<IAiPaymentRunProposal>("AiPaymentRunProposal", AiPaymentRunProposalSchema);

export default AiPaymentRunProposal;

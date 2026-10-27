import mongoose, { Schema, type Document, type Model } from "mongoose";

export const BILLING_REFUND_STATUSES = ["reserving", "pending", "processed", "failed"] as const;
export type BillingRefundStatus = (typeof BILLING_REFUND_STATUSES)[number];

export interface IBillingRefund extends Document {
  tenantId: string;
  paymentRecordId: mongoose.Types.ObjectId;
  providerPaymentId: string;
  idempotencyKey: string;
  amountPaise: number;
  currency: string;
  reason: string;
  status: BillingRefundStatus;
  providerRefundId?: string;
  providerCreatedAt?: Date;
  creditNoteId?: mongoose.Types.ObjectId;
  lastError?: string;
  reconciledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BillingRefundSchema = new Schema<IBillingRefund>(
  {
    tenantId: { type: String, required: true, immutable: true, index: true },
    paymentRecordId: { type: Schema.Types.ObjectId, ref: "BillingPayment", required: true, immutable: true },
    providerPaymentId: { type: String, required: true, immutable: true, index: true },
    idempotencyKey: { type: String, required: true, unique: true, immutable: true },
    amountPaise: { type: Number, required: true, min: 1, immutable: true },
    currency: { type: String, required: true, uppercase: true, immutable: true },
    reason: { type: String, required: true, maxlength: 256, immutable: true },
    status: { type: String, enum: BILLING_REFUND_STATUSES, required: true, default: "reserving", index: true },
    providerRefundId: { type: String, sparse: true, unique: true },
    providerCreatedAt: { type: Date },
    creditNoteId: { type: Schema.Types.ObjectId, ref: "BillingCreditNote" },
    lastError: { type: String, maxlength: 160 },
    reconciledAt: { type: Date },
  },
  { timestamps: true }
);

BillingRefundSchema.index({ paymentRecordId: 1, createdAt: -1 });
BillingRefundSchema.index({ status: 1, updatedAt: 1 });

const BillingRefund: Model<IBillingRefund> =
  (mongoose.models.BillingRefund as Model<IBillingRefund>) ||
  mongoose.model<IBillingRefund>("BillingRefund", BillingRefundSchema);

export default BillingRefund;

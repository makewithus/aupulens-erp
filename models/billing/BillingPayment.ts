import mongoose, { Schema, Document, Model } from "mongoose";

export const BILLING_PAYMENT_STATUS = {
  PENDING: "pending",
  SUCCESSFUL: "successful",
  FAILED: "failed",
  REFUNDED: "refunded",
  DISPUTED: "disputed",
  CANCELLED: "cancelled",
} as const;

export const BILLING_PAYMENT_STATUS_VALUES = Object.values(BILLING_PAYMENT_STATUS);
export type BillingPaymentStatus =
  (typeof BILLING_PAYMENT_STATUS)[keyof typeof BILLING_PAYMENT_STATUS];

export const BILLING_PAYMENT_TYPE = {
  NEW: "new",
  UPGRADE: "upgrade",
  RENEWAL: "renewal",
  DOWNGRADE: "downgrade",
  MANUAL: "manual",
} as const;

export const BILLING_PAYMENT_TYPE_VALUES = Object.values(BILLING_PAYMENT_TYPE);
export type BillingPaymentType =
  (typeof BILLING_PAYMENT_TYPE)[keyof typeof BILLING_PAYMENT_TYPE];

export interface IBillingTaxBreakup {
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  isInterState: boolean;
}

export interface IUpgradeDetails {
  fromPlan: string;
  toPlan: string;
  proratedAmount: number;
  daysRemaining: number;
  totalDaysInCycle: number;
  prorationFraction: number;
}

export interface IRefundDetails {
  refundId: string;
  amount: number;
  reason: string;
  refundedAt: Date;
  status: "processed" | "pending" | "failed";
  razorpayRefundId?: string;
}

export interface IBillingPayment extends Document {
  tenantId: string;
  organizationId?: mongoose.Types.ObjectId;
  subscriptionId?: mongoose.Types.ObjectId | string;
  type: BillingPaymentType;
  amount: number;
  currency: string;
  status: BillingPaymentStatus;
  billingCycle: "monthly" | "yearly";
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  paymentMethod?: string;
  taxBreakup: IBillingTaxBreakup;
  invoiceId?: string;
  receiptNumber?: string;
  upgradeDetails?: IUpgradeDetails;
  refund?: IRefundDetails;
  failureReason?: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const BillingPaymentSchema = new Schema<IBillingPayment>(
  {
    tenantId: { type: String, required: true, index: true, immutable: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    subscriptionId: { type: Schema.Types.Mixed },
    type: { type: String, required: true, enum: BILLING_PAYMENT_TYPE_VALUES },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "INR", uppercase: true },
    status: {
      type: String,
      required: true,
      enum: BILLING_PAYMENT_STATUS_VALUES,
      default: BILLING_PAYMENT_STATUS.PENDING,
      index: true,
    },
    billingCycle: { type: String, enum: ["monthly", "yearly"], default: "monthly" },
    razorpayOrderId: { type: String, sparse: true, index: true },
    razorpayPaymentId: { type: String, sparse: true, index: true },
    razorpaySignature: { type: String },
    paymentMethod: { type: String },
    taxBreakup: {
      taxableAmount: { type: Number, required: true, default: 0 },
      cgst: { type: Number, required: true, default: 0 },
      sgst: { type: Number, required: true, default: 0 },
      igst: { type: Number, required: true, default: 0 },
      totalTax: { type: Number, required: true, default: 0 },
      isInterState: { type: Boolean, required: true, default: false },
    },
    invoiceId: { type: String },
    receiptNumber: { type: String },
    upgradeDetails: {
      fromPlan: { type: String },
      toPlan: { type: String },
      proratedAmount: { type: Number },
      daysRemaining: { type: Number },
      totalDaysInCycle: { type: Number },
      prorationFraction: { type: Number },
    },
    refund: {
      refundId: { type: String },
      amount: { type: Number },
      reason: { type: String },
      refundedAt: { type: Date },
      status: { type: String, enum: ["processed", "pending", "failed"], default: "processed" },
      razorpayRefundId: { type: String },
    },
    failureReason: { type: String },
    idempotencyKey: { type: String, required: true, unique: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

BillingPaymentSchema.index({ tenantId: 1, createdAt: -1 });
BillingPaymentSchema.index({ status: 1, type: 1, createdAt: -1 });

const BillingPayment: Model<IBillingPayment> =
  (mongoose.models.BillingPayment as Model<IBillingPayment>) ||
  mongoose.model<IBillingPayment>("BillingPayment", BillingPaymentSchema);

export default BillingPayment;

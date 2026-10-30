import mongoose, { Schema, Document, Model } from "mongoose";
import {
  PLAN_KEY_VALUES,
  PlanKeyType,
  BILLING_CYCLE_VALUES,
  BillingCycle,
} from "@/lib/constants/statuses";

export const SAAS_SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  TRIAL: "trial",
  PENDING_PAYMENT: "pending_payment",
  PAST_DUE: "past_due",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
  SUSPENDED: "suspended",
} as const;

export const SAAS_SUBSCRIPTION_STATUS_VALUES = Object.values(SAAS_SUBSCRIPTION_STATUS);
export type SaaSSubscriptionStatus =
  (typeof SAAS_SUBSCRIPTION_STATUS)[keyof typeof SAAS_SUBSCRIPTION_STATUS];

export interface IScheduledChange {
  planKey: PlanKeyType;
  userCount?: number;
  addOns?: string[];
  billingCycle?: BillingCycle;
  effectiveDate: Date;
  requestedAt: Date;
  reason?: string;
}

export interface ICancellationDetails {
  requestedAt: Date;
  effectiveDate: Date;
  reason?: string;
}

export interface IAutoPayDetails {
  enabled: boolean;
  status: "pending" | "active" | "failed" | "cancelled" | "not_configured";
  mandateId?: string;
  authTransactionId?: string;
  paymentMethod?: {
    type: "card" | "upi" | "netbanking" | "emandate";
    last4?: string;
    network?: string;
    bank?: string;
  };
}

export interface IGracePeriodDetails {
  isInGrace: boolean;
  graceStartedAt?: Date;
  graceEndsAt?: Date;
  failedAttemptsCount: number;
  lastFailedAt?: Date;
  lastFailureReason?: string;
}

export interface ISaaSSubscription extends Document {
  tenantId: string;
  organizationId?: mongoose.Types.ObjectId;
  planKey: PlanKeyType;
  status: SaaSSubscriptionStatus;
  billingCycle: BillingCycle;
  currentPrice: number;
  userCount: number;
  currency: string;
  startDate: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  paidThroughDate: Date;
  nextRenewalDate: Date;
  trialEndDate?: Date;
  scheduledChange?: IScheduledChange;
  cancellation?: ICancellationDetails;
  autoPay: IAutoPayDetails;
  gracePeriod: IGracePeriodDetails;
  razorpaySubscriptionId?: string;
  razorpayCustomerId?: string;
  lastPaymentId?: string;
  lastInvoiceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledChangeSchema = new Schema<IScheduledChange>(
  {
    planKey: { type: String, enum: PLAN_KEY_VALUES },
    userCount: { type: Number, min: 1 },
    addOns: { type: [String], default: [] },
    billingCycle: { type: String, enum: BILLING_CYCLE_VALUES },
    effectiveDate: { type: Date },
    requestedAt: { type: Date },
    reason: { type: String },
  },
  { _id: false }
);

const CancellationDetailsSchema = new Schema<ICancellationDetails>(
  {
    requestedAt: { type: Date },
    effectiveDate: { type: Date },
    reason: { type: String },
  },
  { _id: false }
);

const SaaSSubscriptionSchema = new Schema<ISaaSSubscription>(
  {
    tenantId: { type: String, required: true, unique: true, index: true, immutable: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    planKey: { type: String, required: true, enum: PLAN_KEY_VALUES },
    status: {
      type: String,
      required: true,
      enum: SAAS_SUBSCRIPTION_STATUS_VALUES,
      default: SAAS_SUBSCRIPTION_STATUS.TRIAL,
      index: true,
    },
    billingCycle: {
      type: String,
      required: true,
      enum: BILLING_CYCLE_VALUES,
      default: "monthly",
    },
    currentPrice: { type: Number, required: true, default: 0 },
    userCount: { type: Number, required: true, default: 1, min: 1 },
    currency: { type: String, required: true, default: "INR", uppercase: true },
    startDate: { type: Date, required: true, default: Date.now },
    currentPeriodStart: { type: Date, required: true, default: Date.now },
    currentPeriodEnd: { type: Date, required: true },
    paidThroughDate: { type: Date, required: true },
    nextRenewalDate: { type: Date, required: true },
    trialEndDate: { type: Date },
    scheduledChange: { type: ScheduledChangeSchema, default: undefined },
    cancellation: { type: CancellationDetailsSchema, default: undefined },
    autoPay: {
      enabled: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["pending", "active", "failed", "cancelled", "not_configured"],
        default: "not_configured",
      },
      mandateId: { type: String },
      authTransactionId: { type: String },
      paymentMethod: {
        type: { type: String, enum: ["card", "upi", "netbanking", "emandate"] },
        last4: { type: String },
        network: { type: String },
        bank: { type: String },
      },
    },
    gracePeriod: {
      isInGrace: { type: Boolean, default: false },
      graceStartedAt: { type: Date },
      graceEndsAt: { type: Date },
      failedAttemptsCount: { type: Number, default: 0 },
      lastFailedAt: { type: Date },
      lastFailureReason: { type: String },
    },
    razorpaySubscriptionId: { type: String, sparse: true },
    razorpayCustomerId: { type: String, sparse: true },
    lastPaymentId: { type: String },
    lastInvoiceId: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

SaaSSubscriptionSchema.index({ status: 1, nextRenewalDate: 1 });
SaaSSubscriptionSchema.index({ "gracePeriod.isInGrace": 1, "gracePeriod.graceEndsAt": 1 });
SaaSSubscriptionSchema.index({ "scheduledChange.effectiveDate": 1 });

const SaaSSubscription: Model<ISaaSSubscription> =
  (mongoose.models.SaaSSubscription as Model<ISaaSSubscription>) ||
  mongoose.model<ISaaSSubscription>("SaaSSubscription", SaaSSubscriptionSchema);

export default SaaSSubscription;

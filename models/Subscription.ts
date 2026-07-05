import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SUBSCRIPTION_BILL_UNIT_VALUES,
  SUBSCRIPTION_BILL_UNIT,
  SALES_SUBSCRIPTION_STATUS_VALUES,
  SALES_SUBSCRIPTION_STATUS,
  SUBSCRIPTION_BILLING_FREQUENCY_VALUES,
  SUBSCRIPTION_BILLING_FREQUENCY,
  type SubscriptionBillUnit,
  type SalesSubscriptionStatus,
  type SubscriptionBillingFrequency,
} from "@/lib/constants/statuses";
import type { IQuoteLineItem } from "@/models/SalesQuotation";

// Created from the Quotes > New Quote > "Subscription Quote" tab, and now also
// from the dedicated Subscriptions tab's New Subscription form (Sales module
// revamp Phase 2). Recurring invoice generation is driven by nextBillingOn via
// app/api/cron/sales/subscriptions-billing.
export interface ISubscription extends Document {
  tenantId: string;
  customerId: mongoose.Types.ObjectId;
  quoteId?: mongoose.Types.ObjectId;
  number?: string; // SUB-000001, auto-generated on create (Phase 2 subscriptions form)
  profileName: string;
  lineItems: IQuoteLineItem[];
  totalAmount: number;
  billEvery: number;
  billEveryUnit: SubscriptionBillUnit;
  neverExpires: boolean;
  expiresAfterCycles?: number;
  customerNotes?: string;
  terms?: string;
  attachments: { name: string; url: string }[];
  paymentMode: "offline" | "online";
  status: SalesSubscriptionStatus;
  createdBy: mongoose.Types.ObjectId;

  // Phase 2 additions — additive, all optional/defaulted so Phase 1 "Subscription
  // Quote" rows keep working unchanged.
  billingFrequency: SubscriptionBillingFrequency;
  startDate: Date;
  trialDays: number;
  trialEndsAt?: Date;
  activatedOn?: Date;
  nextBillingOn?: Date;
  lastBilledOn?: Date;
  expiresOn?: Date; // computed end date when neverExpires is false
  cancelledAt?: Date;
  autoRenew: boolean; // false => surfaces in the "Non-Renewing" view
  metered: boolean;
  unbilledCharges: number;
  salesperson?: string;
  referenceNumber?: string;
  extraDiscount: number;
  extraDiscountMode: "percent" | "amount";
  taxMode: "none" | "tds" | "tcs";
  taxId?: mongoose.Types.ObjectId;
  taxRate: number;
  adjustment: number;
  subTotal: number;
  taxAmount: number;
  generatedInvoiceIds: mongoose.Types.ObjectId[];

  // Dunning engine state (lib/sales/dunningEngine.ts)
  dunningRuleId?: mongoose.Types.ObjectId;
  dunningRetryCount: number;
  nextDunningRetryAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    tenantId: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    quoteId: { type: Schema.Types.ObjectId, ref: "SalesQuotation" },
    number: { type: String },
    profileName: { type: String, required: true, trim: true },
    lineItems: [
      {
        itemId: { type: Schema.Types.ObjectId, ref: "Product" },
        name: { type: String, required: true },
        description: { type: String },
        qty: { type: Number, required: true, min: 0, default: 1 },
        unitPrice: { type: Number, required: true, min: 0, default: 0 },
        discount: { type: Number, default: 0 },
        discountMode: { type: String, enum: ["percent", "amount"], default: "percent" },
        taxRate: { type: Number, default: 0 },
        hsn: { type: String },
        lineTotal: { type: Number, required: true, default: 0 },
      },
    ],
    totalAmount: { type: Number, default: 0 },
    billEvery: { type: Number, required: true, default: 1, min: 1 },
    billEveryUnit: { type: String, enum: SUBSCRIPTION_BILL_UNIT_VALUES, default: SUBSCRIPTION_BILL_UNIT.MONTHS },
    neverExpires: { type: Boolean, default: true },
    expiresAfterCycles: { type: Number },
    customerNotes: { type: String },
    terms: { type: String },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    paymentMode: { type: String, enum: ["offline", "online"], default: "offline" },
    status: { type: String, enum: SALES_SUBSCRIPTION_STATUS_VALUES, default: SALES_SUBSCRIPTION_STATUS.ACTIVE },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    billingFrequency: {
      type: String,
      enum: SUBSCRIPTION_BILLING_FREQUENCY_VALUES,
      default: SUBSCRIPTION_BILLING_FREQUENCY.MONTHLY,
    },
    startDate: { type: Date, default: Date.now },
    trialDays: { type: Number, default: 0, min: 0 },
    trialEndsAt: { type: Date },
    activatedOn: { type: Date },
    nextBillingOn: { type: Date },
    lastBilledOn: { type: Date },
    expiresOn: { type: Date },
    cancelledAt: { type: Date },
    autoRenew: { type: Boolean, default: true },
    metered: { type: Boolean, default: false },
    unbilledCharges: { type: Number, default: 0 },
    salesperson: { type: String },
    referenceNumber: { type: String },
    extraDiscount: { type: Number, default: 0 },
    extraDiscountMode: { type: String, enum: ["percent", "amount"], default: "amount" },
    taxMode: { type: String, enum: ["none", "tds", "tcs"], default: "none" },
    taxId: { type: Schema.Types.ObjectId, ref: "TaxRate" },
    taxRate: { type: Number, default: 0 },
    adjustment: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    generatedInvoiceIds: [{ type: Schema.Types.ObjectId, ref: "SalesInvoice" }],

    dunningRuleId: { type: Schema.Types.ObjectId, ref: "DunningRule" },
    dunningRetryCount: { type: Number, default: 0 },
    nextDunningRetryAt: { type: Date },
  },
  { timestamps: true },
);

SubscriptionSchema.index({ tenantId: 1, status: 1 });
SubscriptionSchema.index({ tenantId: 1, customerId: 1 });
SubscriptionSchema.index({ tenantId: 1, number: 1 }, { unique: true, sparse: true });
SubscriptionSchema.index({ tenantId: 1, nextBillingOn: 1 });

const Subscription: Model<ISubscription> =
  (mongoose.models.Subscription as Model<ISubscription>) ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);

export default Subscription;

import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SUBSCRIPTION_BILL_UNIT_VALUES,
  SUBSCRIPTION_BILL_UNIT,
  SALES_SUBSCRIPTION_STATUS_VALUES,
  SALES_SUBSCRIPTION_STATUS,
  type SubscriptionBillUnit,
  type SalesSubscriptionStatus,
} from "@/lib/constants/statuses";
import type { IQuoteLineItem } from "@/models/SalesQuotation";

// Created from the Quotes > New Quote > "Subscription Quote" tab. Minimal
// recurring-billing profile — actual recurring invoice generation is a
// follow-up; this captures the real, persisted subscription profile itself.
export interface ISubscription extends Document {
  tenantId: string;
  customerId: mongoose.Types.ObjectId;
  quoteId?: mongoose.Types.ObjectId;
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
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    tenantId: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    quoteId: { type: Schema.Types.ObjectId, ref: "SalesQuotation" },
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
  },
  { timestamps: true },
);

SubscriptionSchema.index({ tenantId: 1, status: 1 });
SubscriptionSchema.index({ tenantId: 1, customerId: 1 });

const Subscription: Model<ISubscription> =
  (mongoose.models.Subscription as Model<ISubscription>) ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);

export default Subscription;

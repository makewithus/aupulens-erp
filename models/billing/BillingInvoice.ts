import mongoose, { Schema, Document, Model } from "mongoose";

export interface IBillingInvoiceLineItem {
  description: string;
  periodStart: Date;
  periodEnd: Date;
  qty: number;
  unitPrice: number;
  taxableValue: number;
  taxRate: number;
  taxAmount: number;
  total: number;
}

export interface IBillingPartyDetails {
  name: string;
  address?: string;
  gstin?: string;
  state: string;
  pan?: string;
  email?: string;
}

export interface IBillingInvoice extends Document {
  invoiceNumber: string;
  tenantId: string;
  organizationId?: mongoose.Types.ObjectId;
  paymentId?: string;
  subscriptionId?: string;
  invoiceDate: Date;
  dueDate: Date;
  status: "paid" | "issued" | "refunded" | "cancelled" | "void";
  seller: IBillingPartyDetails;
  customer: IBillingPartyDetails;
  lineItems: IBillingInvoiceLineItem[];
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  currency: string;
  isInterState: boolean;
  placeOfSupply: string;
  paymentReference?: string;
  receiptNumber?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const BillingInvoiceLineItemSchema = new Schema<IBillingInvoiceLineItem>(
  {
    description: { type: String, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    qty: { type: Number, required: true, default: 1 },
    unitPrice: { type: Number, required: true },
    taxableValue: { type: Number, required: true },
    taxRate: { type: Number, required: true, default: 18 },
    taxAmount: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: false }
);

const PartyDetailsSchema = new Schema<IBillingPartyDetails>(
  {
    name: { type: String, required: true },
    address: { type: String },
    gstin: { type: String },
    state: { type: String, required: true },
    pan: { type: String },
    email: { type: String },
  },
  { _id: false }
);

const BillingInvoiceSchema = new Schema<IBillingInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    tenantId: { type: String, required: true, index: true, immutable: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", index: true },
    paymentId: { type: String, index: true },
    subscriptionId: { type: String, index: true },
    invoiceDate: { type: Date, required: true, default: Date.now },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      required: true,
      enum: ["paid", "issued", "refunded", "cancelled", "void"],
      default: "paid",
      index: true,
    },
    seller: { type: PartyDetailsSchema, required: true },
    customer: { type: PartyDetailsSchema, required: true },
    lineItems: { type: [BillingInvoiceLineItemSchema], required: true },
    taxableAmount: { type: Number, required: true },
    cgst: { type: Number, required: true, default: 0 },
    sgst: { type: Number, required: true, default: 0 },
    igst: { type: Number, required: true, default: 0 },
    totalTax: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    currency: { type: String, required: true, default: "INR", uppercase: true },
    isInterState: { type: Boolean, required: true, default: false },
    placeOfSupply: { type: String, required: true },
    paymentReference: { type: String },
    receiptNumber: { type: String },
    notes: { type: String },
  },
  { timestamps: true }
);

BillingInvoiceSchema.index({ tenantId: 1, invoiceDate: -1 });

const BillingInvoice: Model<IBillingInvoice> =
  (mongoose.models.BillingInvoice as Model<IBillingInvoice>) ||
  mongoose.model<IBillingInvoice>("BillingInvoice", BillingInvoiceSchema);

export default BillingInvoice;

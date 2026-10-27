import mongoose, { Schema, type Document, type Model } from "mongoose";
import type { IBillingPartyDetails } from "@/models/billing/BillingInvoice";

export interface IBillingCreditNoteLine {
  description: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface IBillingCreditNote extends Document {
  creditNoteNumber: string;
  tenantId: string;
  paymentId: string;
  refundId: mongoose.Types.ObjectId;
  invoiceId: string;
  issuedAt: Date;
  currency: string;
  seller: IBillingPartyDetails;
  customer: IBillingPartyDetails;
  lines: IBillingCreditNoteLine[];
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
  reason: string;
  allocationMethod: "proportional_to_original_invoice";
  createdAt: Date;
  updatedAt: Date;
}

const PartySchema = new Schema<IBillingPartyDetails>(
  { name: { type: String, required: true }, address: String, gstin: String, state: { type: String, required: true }, pan: String, email: String },
  { _id: false }
);

const BillingCreditNoteSchema = new Schema<IBillingCreditNote>(
  {
    creditNoteNumber: { type: String, required: true, unique: true, immutable: true },
    tenantId: { type: String, required: true, immutable: true, index: true },
    paymentId: { type: String, required: true, immutable: true, index: true },
    refundId: { type: Schema.Types.ObjectId, ref: "BillingRefund", required: true, unique: true, immutable: true },
    invoiceId: { type: String, required: true, immutable: true, index: true },
    issuedAt: { type: Date, required: true, immutable: true },
    currency: { type: String, required: true, uppercase: true, immutable: true },
    seller: { type: PartySchema, required: true, immutable: true },
    customer: { type: PartySchema, required: true, immutable: true },
    lines: { type: [new Schema<IBillingCreditNoteLine>({ description: { type: String, required: true }, taxableAmount: { type: Number, required: true }, cgst: { type: Number, required: true }, sgst: { type: Number, required: true }, igst: { type: Number, required: true }, total: { type: Number, required: true } }, { _id: false })], required: true, immutable: true },
    taxableAmount: { type: Number, required: true, immutable: true },
    cgst: { type: Number, required: true, immutable: true },
    sgst: { type: Number, required: true, immutable: true },
    igst: { type: Number, required: true, immutable: true },
    totalTax: { type: Number, required: true, immutable: true },
    totalAmount: { type: Number, required: true, immutable: true },
    reason: { type: String, required: true, immutable: true },
    allocationMethod: { type: String, enum: ["proportional_to_original_invoice"], required: true, immutable: true },
  },
  { timestamps: true }
);

BillingCreditNoteSchema.index({ tenantId: 1, issuedAt: -1 });

const BillingCreditNote: Model<IBillingCreditNote> =
  (mongoose.models.BillingCreditNote as Model<IBillingCreditNote>) ||
  mongoose.model<IBillingCreditNote>("BillingCreditNote", BillingCreditNoteSchema);

export default BillingCreditNote;

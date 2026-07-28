import mongoose, { Schema, Document } from "mongoose";
import { SalesInvoiceStatus, SALES_INVOICE_STATUS_VALUES, SALES_INVOICE_STATUS } from "@/lib/constants/statuses";

export interface ISalesInvoiceLineItem {
  itemId?: string; // Ref Item/Product
  name: string;
  description?: string;
  qty: number;
  unitPrice: number;
  discount: number;
  discountMode: "percent" | "amount";
  taxRate: number;
  hsn?: string;
  lineTotal: number;
}

export interface ISalesInvoicePayment {
  notes?: string;
  amount: number;
  date: Date;
  mode: string; // Cash, Bank, UPI, etc.
  paymentId?: mongoose.Types.ObjectId; // ref Payment — set when raised from the Payments tab, absent on legacy rows
}

export interface ISalesInvoice extends Document {
  tenantId: string;
  number: string; // prefix + seq
  type: string; // Regular, Bill of Supply
  customerId: mongoose.Types.ObjectId;
  invoiceDate: Date;
  dueDate: Date;
  reference?: string;
  placeOfSupply?: string;

  lineItems: ISalesInvoiceLineItem[];
  itemLevelDiscountPercent?: number;
  additionalCharges: { name: string; amount: number; isTaxable: boolean }[];
  extraDiscount: number;
  extraDiscountMode: "percent" | "amount";
  roundOff: boolean;
  taxableAmount: number;
  totalDiscount: number;
  totalAmount: number;
  
  taxes: {
    tds: number;
    tcs: number;
    gstBreakup: { label: string; amount: number }[];
  };
  
  bankAccountId?: mongoose.Types.ObjectId;
  payments: ISalesInvoicePayment[];
  markedFullyPaid: boolean;
  signatureId?: string;
  
  notes?: string;
  terms?: string;
  eWaybill: boolean;
  eInvoice: boolean;
  
  attachments: { name: string; url: string }[];
  coupons: string[];
  templateId?: mongoose.Types.ObjectId;
  templateKey: string;
  
  status: SalesInvoiceStatus;
  createdBy?: mongoose.Types.ObjectId;

  // GL integration (Issue #9) — mirrors Payment.journalEntryIds/postedSnapshot.
  // Revenue/Receivable/GST/TCS/TDS are posted once the invoice leaves draft,
  // diffed against postedSnapshot on every subsequent save so edits reclass
  // rather than double-post, and reversed (mirror entry) if it goes back to
  // draft or is cancelled.
  journalEntryIds?: mongoose.Types.ObjectId[];
  postedSnapshot?: {
    taxableAmount: number;
    totalTax: number;
    tcsAmount: number;
    tdsAmount: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const SalesInvoiceSchema = new Schema<ISalesInvoice>(
  {
    tenantId: { type: String, required: true },
    number: { type: String, required: true },
    type: { type: String, default: "Regular" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: Date.now },
    reference: { type: String },
    placeOfSupply: { type: String },

    lineItems: [
      {
        itemId: { type: Schema.Types.ObjectId, ref: "Item" },
        name: { type: String, required: true },
        description: { type: String },
        qty: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0 },
        discountMode: { type: String, enum: ["percent", "amount"], default: "percent" },
        taxRate: { type: Number, default: 0 },
        hsn: { type: String },
        lineTotal: { type: Number, required: true },
      },
    ],
    itemLevelDiscountPercent: { type: Number },
    additionalCharges: [
      {
        name: { type: String, required: true },
        amount: { type: Number, required: true },
        isTaxable: { type: Boolean, default: false },
      },
    ],
    extraDiscount: { type: Number, default: 0 },
    extraDiscountMode: { type: String, enum: ["percent", "amount"], default: "amount" },
    roundOff: { type: Boolean, default: false },
    taxableAmount: { type: Number, required: true },
    totalDiscount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    
    taxes: {
      tds: { type: Number, default: 0 },
      tcs: { type: Number, default: 0 },
      gstBreakup: [
        {
          label: { type: String, required: true },
          amount: { type: Number, required: true },
        },
      ],
    },
    
    bankAccountId: { type: Schema.Types.ObjectId, ref: "BankAccount" },
    payments: [
      {
        notes: { type: String },
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        mode: { type: String, required: true },
        paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
      },
    ],
    markedFullyPaid: { type: Boolean, default: false },
    signatureId: { type: String },
    
    notes: { type: String },
    terms: { type: String },
    eWaybill: { type: Boolean, default: false },
    eInvoice: { type: Boolean, default: false },
    
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    coupons: [{ type: String }],
    templateId: { type: Schema.Types.ObjectId, ref: "InvoiceTemplate" },
    templateKey: { type: String, default: "modern" },
    
    status: { type: String, enum: SALES_INVOICE_STATUS_VALUES, default: SALES_INVOICE_STATUS.DRAFT },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },

    journalEntryIds: [{ type: Schema.Types.ObjectId, ref: "JournalEntry" }],
    postedSnapshot: {
      type: new Schema(
        {
          taxableAmount: { type: Number, required: true },
          totalTax: { type: Number, required: true },
          tcsAmount: { type: Number, required: true },
          tdsAmount: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: false,
    },
  },
  { timestamps: true }
);

// Enforce unique invoice number per tenant
SalesInvoiceSchema.index({ tenantId: 1, number: 1 }, { unique: true });

export const SalesInvoice =
  mongoose.models.SalesInvoice || mongoose.model<ISalesInvoice>("SalesInvoice", SalesInvoiceSchema);

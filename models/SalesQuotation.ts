import mongoose, { Schema, Document, Model } from "mongoose";
import { QUOTE_STATUS_VALUES, QUOTE_STATUS, type QuoteStatus } from "@/lib/constants/statuses";

export interface IQuoteLineItem {
  itemId?: mongoose.Types.ObjectId;
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

export interface ISalesQuotation extends Document {
  tenantId: string;
  quoteNumber: string;
  customerId: mongoose.Types.ObjectId;
  reference?: string;
  quoteDate: Date;
  expiryDate?: Date;
  salesperson?: string;
  projectName?: string;
  subject?: string;

  lineItems: IQuoteLineItem[];
  itemLevelDiscountPercent?: number;
  extraDiscount: number;
  extraDiscountMode: "percent" | "amount";
  taxes: {
    mode: "none" | "tds" | "tcs";
    taxId?: mongoose.Types.ObjectId;
    rate: number;
    amount: number;
  };
  adjustment: number;
  taxableAmount: number;
  totalDiscount: number;
  totalAmount: number;

  customerNotes?: string;
  terms?: string;
  attachments: { name: string; url: string }[];
  templateKey: string;

  status: QuoteStatus;
  convertedInvoiceId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const SalesQuotationSchema = new Schema<ISalesQuotation>(
  {
    tenantId: { type: String, required: true },
    quoteNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    reference: { type: String },
    quoteDate: { type: Date, default: Date.now },
    expiryDate: { type: Date },
    salesperson: { type: String, trim: true },
    projectName: { type: String, trim: true },
    subject: { type: String },

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
    itemLevelDiscountPercent: { type: Number, default: 0 },
    extraDiscount: { type: Number, default: 0 },
    extraDiscountMode: { type: String, enum: ["percent", "amount"], default: "amount" },
    taxes: {
      mode: { type: String, enum: ["none", "tds", "tcs"], default: "none" },
      taxId: { type: Schema.Types.ObjectId, ref: "TaxRate" },
      rate: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
    },
    adjustment: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    customerNotes: { type: String, default: "Looking forward for your business." },
    terms: { type: String },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    templateKey: { type: String, default: "spreadsheet" },

    status: { type: String, enum: QUOTE_STATUS_VALUES, default: QUOTE_STATUS.DRAFT },
    convertedInvoiceId: { type: Schema.Types.ObjectId, ref: "SalesInvoice" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

SalesQuotationSchema.index({ tenantId: 1, quoteNumber: 1 }, { unique: true });
SalesQuotationSchema.index({ tenantId: 1, status: 1 });
SalesQuotationSchema.index({ tenantId: 1, customerId: 1 });

const SalesQuotation: Model<ISalesQuotation> =
  (mongoose.models.SalesQuotation as Model<ISalesQuotation>) ||
  mongoose.model<ISalesQuotation>("SalesQuotation", SalesQuotationSchema);

export default SalesQuotation;

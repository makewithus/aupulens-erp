import mongoose, { Schema, Document, Model } from "mongoose";
import "@/models/Account";
import "@/models/Customer";
import "@/models/Product";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  PAYMENT_STATE_VALUES,
  PAYMENT_STATE,
  type DocumentStatus,
  type PaymentState,
} from "@/lib/constants/statuses";

export interface IInvoiceLine {
  productId: mongoose.Types.ObjectId;
  name: string; // Description
  quantity: number;
  priceUnit: number;
  priceSubtotal: number;
  taxIds: number[]; // Array of tax IDs (consistent with SO)
  accountId?: mongoose.Types.ObjectId; // Income/Expense Account
  discount?: number;
}

export interface IInvoice extends Document {
  tenantId?: string;
  name: string; // INV/2026/001 or Draft
  partnerId: mongoose.Types.ObjectId;
  invoiceDate: Date;
  dueDate: Date;
  state: DocumentStatus;
  moveType: "out_invoice" | "in_invoice" | "out_refund" | "in_refund"; // Odoo style: out_invoice = Customer Invoice

  // Lines
  invoiceLines: IInvoiceLine[];

  // Accounting / payments
  currencyId: string; // e.g. "INR"
  journalId?: mongoose.Types.ObjectId; // Optional for now
  receivableAccountId?: mongoose.Types.ObjectId; // For Customer Invoice
  payableAccountId?: mongoose.Types.ObjectId; // For Vendor Bill

  // Source linking
  sourceDocument?: string; // e.g. SO-2026-001
  sourceId?: mongoose.Types.ObjectId; // Reference to SaleOrder ID

  // Totals
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  amountResidual: number; // Amount due

  paymentState: PaymentState;
  poReference?: string;
  grnReference?: string;
  poMatchType?: "2_way" | "3_way";
  poMatchStatus?: "pending" | "matched" | "mismatch";
  manualReviewRequired?: boolean;
  discrepancyNotes?: string;
  paymentScheduledDate?: Date;
  paidDate?: Date;

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema: Schema<IInvoice> = new Schema(
  {
    tenantId: { type: String },
    name: { type: String, default: "Draft", index: true },
    partnerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date, default: Date.now },
    state: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    moveType: {
      type: String,
      enum: ["out_invoice", "in_invoice", "out_refund", "in_refund"],
      default: "out_invoice",
    },
    invoiceLines: [
      {
        productId: { type: Schema.Types.ObjectId, ref: "Product" },
        name: { type: String },
        quantity: { type: Number, default: 1 },
        priceUnit: { type: Number, default: 0 },
        priceSubtotal: { type: Number, default: 0 },
        taxIds: [{ type: Number }],
        accountId: { type: Schema.Types.ObjectId, ref: "Account" },
        discount: { type: Number, default: 0 },
      },
    ],
    currencyId: { type: String, default: "INR" },
    journalId: { type: Schema.Types.ObjectId, ref: "Journal" },
    receivableAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    payableAccountId: { type: Schema.Types.ObjectId, ref: "Account" },

    sourceDocument: { type: String },
    sourceId: { type: Schema.Types.ObjectId }, // Flexible ref

    amountUntaxed: { type: Number, default: 0 },
    amountTax: { type: Number, default: 0 },
    amountTotal: { type: Number, default: 0 },
    amountResidual: { type: Number, default: 0 },

    paymentState: {
      type: String,
      enum: PAYMENT_STATE_VALUES,
      default: PAYMENT_STATE.NOT_PAID,
    },
    poReference: { type: String },
    grnReference: { type: String },
    poMatchType: {
      type: String,
      enum: ["2_way", "3_way"],
      default: "2_way",
    },
    poMatchStatus: {
      type: String,
      enum: ["pending", "matched", "mismatch"],
      default: "pending",
    },
    manualReviewRequired: { type: Boolean, default: false },
    discrepancyNotes: { type: String },
    paymentScheduledDate: { type: Date },
    paidDate: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: "User" }, // Optional if system generated
  },
  { timestamps: true },
);

InvoiceSchema.index({ tenantId: 1, name: 1 }, { unique: true });
InvoiceSchema.index({ partnerId: 1 });
InvoiceSchema.index({ tenantId: 1, moveType: 1 });
InvoiceSchema.index({ tenantId: 1, state: 1 });
InvoiceSchema.index({ tenantId: 1, paymentState: 1 });
InvoiceSchema.index({ tenantId: 1, moveType: 1, state: 1 });
InvoiceSchema.index({ tenantId: 1, invoiceDate: -1, createdAt: -1 });
InvoiceSchema.index({ tenantId: 1, createdAt: -1 });

const Invoice: Model<IInvoice> =
  (mongoose.models.Invoice as Model<IInvoice>) ||
  mongoose.model<IInvoice>("Invoice", InvoiceSchema);

export default Invoice;

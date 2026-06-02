import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IBill extends Document {
  tenantId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  vendorEmail: string;
  items: {
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  status: DocumentStatus;
  issueDate: Date;
  dueDate: Date;
  paidDate?: Date;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BillSchema = new Schema<IBill>(
  {
    tenantId: { type: String, required: true, index: true },
    billNumber: { type: String, required: true, unique: true },
    vendorId: { type: String, required: true },
    vendorName: { type: String, required: true },
    vendorEmail: { type: String, required: true },
    items: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, required: true },
        rate: { type: Number, required: true },
        amount: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    paidDate: { type: Date },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

BillSchema.index({ status: 1 });
BillSchema.index({ dueDate: 1 });
BillSchema.index({ vendorId: 1 });

const Bill: Model<IBill> =
  (mongoose.models.Bill as Model<IBill>) ||
  mongoose.model<IBill>("Bill", BillSchema);

export default Bill;

import mongoose, { Schema, Document, Model } from "mongoose";
import { EINVOICE_STATUS_VALUES, EINVOICE_STATUS, type EinvoiceStatus } from "@/lib/constants/statuses";

export interface IEInvoice extends Document {
  tenantId: string;
  invoiceId: mongoose.Types.ObjectId; // ref SalesInvoice
  amount: number;
  status: EinvoiceStatus;
  irn?: string;
  ackNo?: string;
  ackDate?: Date;
  errorMessage?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EInvoiceSchema: Schema<IEInvoice> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "SalesInvoice", required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: EINVOICE_STATUS_VALUES, default: EINVOICE_STATUS.PENDING },
    irn: { type: String, trim: true },
    ackNo: { type: String, trim: true },
    ackDate: { type: Date },
    errorMessage: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

EInvoiceSchema.index({ tenantId: 1, status: 1 });
EInvoiceSchema.index({ tenantId: 1, invoiceId: 1 }, { unique: true });
EInvoiceSchema.index({ tenantId: 1, createdAt: -1 });

const EInvoice: Model<IEInvoice> =
  (mongoose.models.EInvoice as Model<IEInvoice>) || mongoose.model<IEInvoice>("EInvoice", EInvoiceSchema);

export default EInvoice;

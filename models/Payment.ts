import mongoose, { Schema, Document, Model } from "mongoose";
import { PAYMENT_STATUS, PAYMENT_STATUS_VALUES, PAYMENT_TYPE, PAYMENT_TYPE_VALUES } from "@/lib/constants/statuses";

// A real Payment entity (Phase 3 of the Sales revamp). Distinct from the
// legacy flattened SalesInvoice.payments[] rows: those stay in sync (see
// lib/sales/paymentAllocation.ts) so pre-existing status derivation and
// consumers of that subdocument keep working untouched, but this collection
// is the source of truth for the Payments tab (record/void/import/export,
// unused-amount tracking, retainer payments).
export interface IPaymentAllocation {
  invoiceId: mongoose.Types.ObjectId;
  amount: number;
}

export interface IPayment extends Document {
  tenantId: string;
  customerId: mongoose.Types.ObjectId;
  paymentNumber: string;
  paymentDate: Date;
  amountReceived: number;
  bankCharges: number;
  mode: string;
  depositToAccountId?: mongoose.Types.ObjectId;
  reference?: string;
  taxDeducted: boolean;
  tdsAccountId?: mongoose.Types.ObjectId;
  tdsAmount: number;
  allocations: IPaymentAllocation[];
  unusedAmount: number; // amount received minus allocated minus bank charges/tds — becomes customer credit
  status: string;
  paymentType: string;
  notes?: string;
  customFieldValues?: Record<string, any>;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    tenantId: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    paymentNumber: { type: String, required: true },
    paymentDate: { type: Date, default: Date.now },
    amountReceived: { type: Number, required: true, min: 0 },
    bankCharges: { type: Number, default: 0, min: 0 },
    mode: { type: String, default: "Cash" },
    depositToAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    reference: { type: String },
    taxDeducted: { type: Boolean, default: false },
    tdsAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    tdsAmount: { type: Number, default: 0, min: 0 },
    allocations: [
      {
        invoiceId: { type: Schema.Types.ObjectId, ref: "SalesInvoice", required: true },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    unusedAmount: { type: Number, default: 0 },
    status: { type: String, enum: PAYMENT_STATUS_VALUES, default: PAYMENT_STATUS.DRAFT },
    paymentType: { type: String, enum: PAYMENT_TYPE_VALUES, default: PAYMENT_TYPE.INVOICE_PAYMENT },
    notes: { type: String },
    customFieldValues: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

PaymentSchema.index({ tenantId: 1, paymentNumber: 1 }, { unique: true });
PaymentSchema.index({ tenantId: 1, customerId: 1 });
PaymentSchema.index({ tenantId: 1, status: 1 });

const Payment: Model<IPayment> =
  (mongoose.models.Payment as Model<IPayment>) || mongoose.model<IPayment>("Payment", PaymentSchema);

export default Payment;

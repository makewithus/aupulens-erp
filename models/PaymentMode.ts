import mongoose, { Schema, Document, Model } from "mongoose";

// Tenant-wide catalog of payment modes (Record Payment "Payment Mode" combobox
// — "Choose the payment term or type to add"). Mirrors models/DeliveryMethod.ts's
// shape/pattern exactly.
export interface IPaymentMode extends Document {
  tenantId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentModeSchema = new Schema<IPaymentMode>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

PaymentModeSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const PaymentMode: Model<IPaymentMode> =
  (mongoose.models.PaymentMode as Model<IPaymentMode>) ||
  mongoose.model<IPaymentMode>("PaymentMode", PaymentModeSchema);

export default PaymentMode;

import mongoose, { Schema, Document, Model } from "mongoose";
import { PAYMENT_GATEWAY_STATUS, PAYMENT_GATEWAY_STATUS_VALUES } from "@/lib/constants/statuses";

// Online Payments settings (spec §7.3 item 5). One row per gateway type per
// tenant (Razorpay / PayPal / Stripe / Bank Transfer / Manual-Offline are
// lazily seeded — see app/api/sales/online-payment-gateways/route.ts —
// custom gateways can also be added). `credentials` is stored as a plain
// object for now: no encryption-at-rest since this environment never receives
// real API keys/secrets (see lib/sales/paymentGatewayService.ts's stub note).
// TODO: once real gateway credentials are ever supplied, this field must be
// encrypted at rest (e.g. via a KMS-backed field encryption) before go-live.
export interface IPaymentGateway extends Document {
  tenantId: string;
  name: string; // free text — "Razorpay", "PayPal", "Stripe", "Bank Transfer", "Manual/Offline", or a custom name
  provider: string; // short machine key — "razorpay" | "paypal" | "stripe" | "bank_transfer" | "manual" | custom
  status: string; // "connected" | "disconnected"
  credentials?: Record<string, any>;
  isDefault: boolean; // seeded default rows can't be deleted, mirroring the "system view" pattern
  connectedAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentGatewaySchema = new Schema<IPaymentGateway>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    provider: { type: String, required: true, trim: true },
    status: { type: String, enum: PAYMENT_GATEWAY_STATUS_VALUES, default: PAYMENT_GATEWAY_STATUS.DISCONNECTED },
    credentials: { type: Schema.Types.Mixed },
    isDefault: { type: Boolean, default: false },
    connectedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Golden Rule #7: unique indexes must be compound with tenantId — one config
// per gateway type (provider) per tenant.
PaymentGatewaySchema.index({ tenantId: 1, provider: 1 }, { unique: true });

const PaymentGateway: Model<IPaymentGateway> =
  (mongoose.models.PaymentGateway as Model<IPaymentGateway>) ||
  mongoose.model<IPaymentGateway>("PaymentGateway", PaymentGatewaySchema);

export default PaymentGateway;

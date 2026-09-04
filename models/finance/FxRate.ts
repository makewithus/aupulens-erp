import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * FX rate table (docs/ai/BRIEF-04-BATCH-C.md A.1) — deliberately narrow. Chunk 3's own finding
 * established that `PurchaseOrder`, `SaleOrder` and `SalesInvoice` carry no currency field at
 * all; only `Invoice.currencyId` and `BankAccount.currency` can ever be non-INR. There is
 * almost nothing to remeasure, so this is a rate *lookup table* for AI-13's close-blocker check
 * (a non-INR balance with no rate for the period end), not a remeasurement engine.
 *
 * **Manual and import entry only. AI code reads this model and never writes it — no write tool
 * wraps it anywhere in lib/aiRuntime/, by design (Hard Rule: the AI never invents a rate).**
 */

export const FX_RATE_SOURCE = {
  MANUAL: "manual",
  IMPORT: "import",
} as const;
export type FxRateSource = (typeof FX_RATE_SOURCE)[keyof typeof FX_RATE_SOURCE];

export interface IFxRate extends Document {
  tenantId: string;
  fromCurrency: string;
  toCurrency: string;
  rateDate: Date;
  rate: number;
  source: FxRateSource;
  enteredBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FxRateSchema: Schema<IFxRate> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    fromCurrency: { type: String, required: true, uppercase: true },
    toCurrency: { type: String, required: true, uppercase: true },
    rateDate: { type: Date, required: true },
    rate: { type: Number, required: true },
    source: { type: String, enum: Object.values(FX_RATE_SOURCE), required: true },
    enteredBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

FxRateSchema.index({ tenantId: 1, fromCurrency: 1, toCurrency: 1, rateDate: 1 }, { unique: true });

const FxRate: Model<IFxRate> = (mongoose.models.FxRate as Model<IFxRate>) || mongoose.model<IFxRate>("FxRate", FxRateSchema);

export default FxRate;

import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICurrencyAdjustment extends Document {
  tenantId: string;
  currency: string;
  baseCurrency: string;
  dateOfAdjustment: Date;
  exchangeRate: number;
  previousExchangeRate?: number;
  gainOrLoss: number;
  notes: string;
  journalEntryId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CurrencyAdjustmentSchema: Schema<ICurrencyAdjustment> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    currency: { type: String, required: true },
    baseCurrency: { type: String, required: true },
    dateOfAdjustment: { type: Date, required: true },
    exchangeRate: { type: Number, required: true },
    previousExchangeRate: { type: Number },
    gainOrLoss: { type: Number, default: 0 },
    notes: { type: String, required: true, maxlength: 500 },
    journalEntryId: { type: Schema.Types.ObjectId, ref: "JournalEntry" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

CurrencyAdjustmentSchema.index({ tenantId: 1, currency: 1, dateOfAdjustment: -1 });

const CurrencyAdjustment: Model<ICurrencyAdjustment> =
  (mongoose.models.CurrencyAdjustment as Model<ICurrencyAdjustment>) ||
  mongoose.model<ICurrencyAdjustment>("CurrencyAdjustment", CurrencyAdjustmentSchema);

export default CurrencyAdjustment;

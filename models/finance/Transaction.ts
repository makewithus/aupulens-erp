import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITransaction extends Document {
  tenantId: string; // NEW: Multi-tenant support
  date: Date;
  account: string;
  accountCategory: string;
  type: 'debit' | 'credit';
  amount: number;
  currency: string;
  exchangeRate: number;
  baseAmount: number; // amount in base currency
  notes?: string;
  reference?: string;
  invoiceId?: string;
  billId?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    tenantId: { type: String, required: true, index: true }, // NEW: Multi-tenant support
    date: { type: Date, required: true },
    account: { type: String, required: true },
    accountCategory: {
      type: String,
      required: true,
      enum: ['revenue', 'expense', 'asset', 'liability', 'equity']
    },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    exchangeRate: { type: Number, default: 1 },
    baseAmount: { type: Number, required: true },
    notes: { type: String },
    reference: { type: String },
    invoiceId: { type: String },
    billId: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

TransactionSchema.index({ date: -1 });
TransactionSchema.index({ account: 1 });
TransactionSchema.index({ type: 1 });

const Transaction: Model<ITransaction> =
  (mongoose.models.Transaction as Model<ITransaction>) ||
  mongoose.model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;

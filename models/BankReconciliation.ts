import mongoose, { Schema, Document, Model } from 'mongoose';
import {
  RECONCILIATION_STATUS,
  RECONCILIATION_STATUS_VALUES,
  type ReconciliationStatus,
} from '@/lib/constants/statuses';

export interface IBankReconciliation extends Document {
  tenantId: string;
  bankStatementDate: Date;
  bankBalance: number;
  ledgerBalance: number;
  transactions: {
    date: Date;
    description: string;
    amount: number;
    type: 'debit' | 'credit';
    bankTransactionId?: string;
    ledgerTransactionId?: string;
    status: ReconciliationStatus;
    source: 'bank' | 'ledger' | 'both';
  }[];
  reconciled: boolean;
  reconciledBy?: mongoose.Types.ObjectId;
  reconciledAt?: Date;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BankReconciliationSchema = new Schema<IBankReconciliation>(
  {
    tenantId: { type: String, required: true, index: true },
    bankStatementDate: { type: Date, required: true },
    bankBalance: { type: Number, required: true },
    ledgerBalance: { type: Number, required: true },
    transactions: [{
      date: { type: Date, required: true },
      description: { type: String, required: true },
      amount: { type: Number, required: true },
      type: { type: String, enum: ['debit', 'credit'], required: true },
      bankTransactionId: { type: String },
      ledgerTransactionId: { type: String },
      status: { 
        type: String, 
        enum: RECONCILIATION_STATUS_VALUES,
        default: RECONCILIATION_STATUS.UNMATCHED
      },
      source: { 
        type: String, 
        enum: ['bank', 'ledger', 'both'],
        required: true
      },
    }],
    reconciled: { type: Boolean, default: false },
    reconciledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reconciledAt: { type: Date },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

BankReconciliationSchema.index({ tenantId: 1, bankStatementDate: -1 });
BankReconciliationSchema.index({ tenantId: 1, reconciled: 1 });

const BankReconciliation: Model<IBankReconciliation> =
  (mongoose.models.BankReconciliation as Model<IBankReconciliation>) ||
  mongoose.model<IBankReconciliation>('BankReconciliation', BankReconciliationSchema);

export default BankReconciliation;

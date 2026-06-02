import mongoose, { Schema, models, model, Model } from 'mongoose';
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from '@/lib/constants/statuses';

export interface ISalesQuotation extends mongoose.Document {
  tenantId: string;
  quoteNumber: string;
  customer: string;
  customerEmail?: string;
  items: { description: string; quantity: number; rate: number; amount: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
  status: DocumentStatus;
  validUntil?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SalesQuotationSchema = new Schema<ISalesQuotation>({
  tenantId: { type: String, required: true, index: true },
  quoteNumber: { type: String, required: true, unique: true },
  customer: { type: String, required: true },
  customerEmail: { type: String },
  items: [{
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    rate: { type: Number, required: true },
    amount: { type: Number, required: true },
  }],
  subtotal: { type: Number, required: true },
  taxRate: { type: Number, required: true, default: 18 },
  taxAmount: { type: Number, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: DOCUMENT_STATUS_VALUES, default: DOCUMENT_STATUS.DRAFT },
  validUntil: { type: String },
  notes: { type: String },
}, { timestamps: true });

const SalesQuotation: Model<ISalesQuotation> =
  (models.SalesQuotation as Model<ISalesQuotation>) ||
  model<ISalesQuotation>('SalesQuotation', SalesQuotationSchema);
export default SalesQuotation;


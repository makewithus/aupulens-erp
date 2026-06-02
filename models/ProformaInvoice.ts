import mongoose, { Schema, models, model, Model } from 'mongoose';
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from '@/lib/constants/statuses';

export interface IProformaInvoice extends mongoose.Document {
  tenantId: string;
  piNumber: string;
  customer: string;
  customerEmail?: string;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  amount: number;
  status: DocumentStatus;
  validUntil?: string;
  termsAndConditions?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProformaInvoiceSchema = new Schema<IProformaInvoice>({
  tenantId: { type: String, required: true, index: true },
  piNumber: { type: String, required: true, unique: true },
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
  termsAndConditions: { type: String },
  notes: { type: String },
}, { timestamps: true });

const ProformaInvoice: Model<IProformaInvoice> =
  (models.ProformaInvoice as Model<IProformaInvoice>) ||
  model<IProformaInvoice>('ProformaInvoice', ProformaInvoiceSchema);
export default ProformaInvoice;



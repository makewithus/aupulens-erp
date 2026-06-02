import mongoose, { Schema, models, model, Model } from 'mongoose';
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from '@/lib/constants/statuses';

export interface ISalesOrder extends mongoose.Document {
  tenantId: string; // NEW: Multi-tenant support
  orderNumber: string;
  customer: string;
  customerEmail?: string;
  items: { description: string; quantity: number; price: number; amount: number }[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  status: DocumentStatus;
  shippingAddress?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SalesOrderSchema = new Schema<ISalesOrder>({
  tenantId: { type: String, required: true, index: true }, // NEW: Multi-tenant support
  orderNumber: { type: String, required: true, unique: true },
  customer: { type: String, required: true },
  customerEmail: { type: String },
  items: [{
    description: { type: String, required: true },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    amount: { type: Number, required: true },
  }],
  subtotal: { type: Number, required: true },
  taxRate: { type: Number, required: true, default: 18 },
  taxAmount: { type: Number, required: true },
  total: { type: Number, required: true },
  status: { type: String, enum: DOCUMENT_STATUS_VALUES, default: DOCUMENT_STATUS.DRAFT },
  shippingAddress: { type: String },
  notes: { type: String },
}, { timestamps: true });

SalesOrderSchema.index({ status: 1 });

const SalesOrder: Model<ISalesOrder> =
  (models.SalesOrder as Model<ISalesOrder>) ||
  model<ISalesOrder>('SalesOrder', SalesOrderSchema);
export default SalesOrder;

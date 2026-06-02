import mongoose, { Schema, Document } from 'mongoose';
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from '@/lib/constants/statuses';

export interface IOrderItem {
  itemCode: string;
  itemName: string;
  quantity: number;
  fulfilledQuantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface IOrder extends Document {
  tenantId: string; // NEW: Multi-tenant support
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  orderDate: Date;
  expectedDeliveryDate: Date;
  items: IOrderItem[];
  totalAmount: number;
  status: DocumentStatus;
  warehouse: string;
  shippingAddress?: string;
  trackingNumber?: string;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema: Schema<IOrder> = new Schema(
  {
    tenantId: { type: String, required: true, index: true }, // NEW: Multi-tenant support
    orderNumber: { type: String, required: true, unique: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, trim: true },
    orderDate: { type: Date, required: true, default: Date.now },
    expectedDeliveryDate: { type: Date, required: true },
    items: [
      {
        itemCode: { type: String, required: true },
        itemName: { type: String, required: true },
        quantity: { type: Number, required: true },
        fulfilledQuantity: { type: Number, default: 0 },
        unitPrice: { type: Number, required: true },
        totalPrice: { type: Number, required: true },
      },
    ],
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    warehouse: { type: String, required: true, trim: true },
    shippingAddress: { type: String, trim: true },
    trackingNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

OrderSchema.index({ status: 1 });
OrderSchema.index({ orderDate: 1 });

const Order =
  (mongoose.models?.Order as mongoose.Model<IOrder>) ||
  mongoose.model<IOrder>('Order', OrderSchema);

export default Order;

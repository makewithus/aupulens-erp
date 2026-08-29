import mongoose, { Schema, Document } from 'mongoose';
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from '@/lib/constants/statuses';

export interface IInventoryOrderItem {
  itemCode: string;
  itemName: string;
  quantity: number;
  fulfilledQuantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface IInventoryOrder extends Document {
  tenantId: string;
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  orderDate: Date;
  expectedDeliveryDate: Date;
  items: IInventoryOrderItem[];
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

const InventoryOrderSchema: Schema<IInventoryOrder> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, trim: true },
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

// Compound unique index — replaces the old bare orderNumber_1 index (see MEMORY.md Deployment Steps)
InventoryOrderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });
InventoryOrderSchema.index({ status: 1 });
InventoryOrderSchema.index({ orderDate: 1 });

// Keep collection name 'orders' to preserve existing MongoDB data
const InventoryOrder =
  (mongoose.models?.InventoryOrder as mongoose.Model<IInventoryOrder>) ||
  mongoose.model<IInventoryOrder>('InventoryOrder', InventoryOrderSchema, 'orders');

export default InventoryOrder;

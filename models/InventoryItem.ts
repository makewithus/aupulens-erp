import mongoose, { Schema, Document } from 'mongoose';
import {
  STOCK_LEVEL_STATUS,
  STOCK_LEVEL_STATUS_VALUES,
  type StockLevelStatus,
} from '@/lib/constants/statuses';

export interface IInventoryItem extends Document {
  tenantId: string; // NEW: Multi-tenant support
  itemCode: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  reorderQuantity: number;
  unitCost: number;
  totalValue: number;
  warehouse: string;
  location?: string;
  status: StockLevelStatus;
  lastRestocked?: Date;
  supplier?: string;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryItemSchema: Schema<IInventoryItem> = new Schema(
  {
    tenantId: { type: String, required: true, index: true }, // NEW
    itemCode: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 0 },
    reorderLevel: { type: Number, required: true, default: 0 },
    reorderQuantity: { type: Number, required: true, default: 0 },
    unitCost: { type: Number, required: true, default: 0 },
    totalValue: { type: Number, required: true, default: 0 },
    warehouse: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    status: {
      type: String,
      enum: STOCK_LEVEL_STATUS_VALUES,
      default: STOCK_LEVEL_STATUS.IN_STOCK,
    },
    lastRestocked: { type: Date },
    supplier: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

InventoryItemSchema.index({ tenantId: 1, itemCode: 1 }, { unique: true });
InventoryItemSchema.index({ status: 1 });
InventoryItemSchema.index({ category: 1 });

const InventoryItem =
  (mongoose.models?.InventoryItem as mongoose.Model<IInventoryItem>) ||
  mongoose.model<IInventoryItem>('InventoryItem', InventoryItemSchema);

export default InventoryItem;

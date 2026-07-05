import mongoose, { Schema, Document } from 'mongoose';
import {
  BATCH_STATUS,
  BATCH_STATUS_VALUES,
  BATCH_CUSTOMS_STATUS,
  BATCH_CUSTOMS_STATUS_VALUES,
  type BatchStatus,
} from '@/lib/constants/statuses';

export interface IBatch extends Document {
  tenantId: string;
  batchNumber: string;
  lotNumber: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  manufactureDate: Date;
  expiryDate?: Date;
  warehouse: string;
  location?: string;
  status: BatchStatus;
  bondedWarehouse: boolean;
  customsStatus?: 'pending' | 'cleared' | 'bonded';
  supplier?: string;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BatchSchema: Schema<IBatch> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    batchNumber: { type: String, required: true, trim: true },
    lotNumber: { type: String, required: true, trim: true },
    itemCode: { type: String, required: true, trim: true },
    itemName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, default: 0 },
    manufactureDate: { type: Date, required: true },
    expiryDate: { type: Date },
    warehouse: { type: String, required: true, trim: true },
    location: { type: String, trim: true },
    status: {
      type: String,
      enum: BATCH_STATUS_VALUES,
      default: BATCH_STATUS.ACTIVE,
    },
    bondedWarehouse: { type: Boolean, default: false },
    customsStatus: {
      type: String,
      enum: BATCH_CUSTOMS_STATUS_VALUES,
    },
    supplier: { type: String, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Compound with tenantId per Golden Rule #7 — batch numbers only need to be
// unique within a tenant, not globally across the whole platform.
BatchSchema.index({ tenantId: 1, batchNumber: 1 }, { unique: true });

const Batch =
  (mongoose.models?.Batch as mongoose.Model<IBatch>) ||
  mongoose.model<IBatch>('Batch', BatchSchema);

export default Batch;

import mongoose, { Schema, Document } from 'mongoose';
import {
  ENTITY_STATUS,
  ENTITY_STATUS_VALUES,
  type EntityStatus,
} from '@/lib/constants/statuses';

export interface IWarehouse extends Document {
  tenantId: string;
  warehouseCode: string;
  name: string;
  location: string;
  address: string;
  capacity: number;
  currentUtilization: number;
  type: 'standard' | 'bonded' | 'cold-storage' | 'hazmat';
  manager?: string;
  contact?: string;
  email?: string;
  status: EntityStatus;
  bondedLicense?: string;
  bondedExpiryDate?: Date;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WarehouseSchema: Schema<IWarehouse> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    warehouseCode: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, default: 0 },
    currentUtilization: { type: Number, default: 0 },
    type: {
      type: String,
      enum: ['standard', 'bonded', 'cold-storage', 'hazmat'],
      default: 'standard',
    },
    manager: { type: String, trim: true },
    contact: { type: String, trim: true },
    email: { type: String, trim: true },
    status: {
      type: String,
      enum: ENTITY_STATUS_VALUES,
      default: ENTITY_STATUS.ACTIVE,
    },
    bondedLicense: { type: String, trim: true },
    bondedExpiryDate: { type: Date },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const Warehouse =
  (mongoose.models?.Warehouse as mongoose.Model<IWarehouse>) ||
  mongoose.model<IWarehouse>('Warehouse', WarehouseSchema);

export default Warehouse;

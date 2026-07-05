import mongoose, { Schema, models, model, Model } from 'mongoose';
import {
  SHIPMENT_TRACKING_STATUS_VALUES,
  SHIPMENT_TRACKING_STATUS,
  CUSTOMS_STATUS_VALUES,
  type ShipmentTrackingStatus,
  type CustomsStatusType,
} from '@/lib/constants/statuses';

export interface IShipment extends mongoose.Document {
  tenantId: string;
  shipmentNumber: string;
  customerName: string;
  customerEmail?: string;
  origin: string;
  destination: string;
  freightProvider: string;
  trackingNumber?: string;
  shipmentType: 'air' | 'sea' | 'road' | 'rail';
  weight: number;
  volume: number;
  items: Array<{
    description: string;
    hsCode?: string;
    quantity: number;
    weight: number;
    value: number;
  }>;
  totalValue: number;
  currency: string;
  status: ShipmentTrackingStatus;
  estimatedDelivery?: string;
  actualDelivery?: string;
  customsStatus?: CustomsStatusType;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ShipmentSchema = new Schema<IShipment>({
  tenantId: { type: String, required: true, index: true },
  shipmentNumber: { type: String, required: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String },
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  freightProvider: { type: String, required: true },
  trackingNumber: { type: String },
  shipmentType: { type: String, enum: ['air', 'sea', 'road', 'rail'], required: true },
  weight: { type: Number, required: true },
  volume: { type: Number, required: true },
  items: [{
    description: { type: String, required: true },
    hsCode: { type: String },
    quantity: { type: Number, required: true },
    weight: { type: Number, required: true },
    value: { type: Number, required: true },
  }],
  totalValue: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  status: { type: String, enum: SHIPMENT_TRACKING_STATUS_VALUES, default: SHIPMENT_TRACKING_STATUS.PENDING },
  estimatedDelivery: { type: String },
  actualDelivery: { type: String },
  customsStatus: { type: String, enum: CUSTOMS_STATUS_VALUES },
  notes: { type: String },
}, { timestamps: true });

// Compound with tenantId per Golden Rule #7 — shipment numbers only need to
// be unique within a tenant, not globally across the whole platform.
ShipmentSchema.index({ tenantId: 1, shipmentNumber: 1 }, { unique: true });

const Shipment: Model<IShipment> =
  (models.Shipment as Model<IShipment>) ||
  model<IShipment>('Shipment', ShipmentSchema);
export default Shipment;

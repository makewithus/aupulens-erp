import mongoose, { Schema, models, model, Model } from 'mongoose';
import {
  SHIPMENT_TRACKING_STATUS_VALUES,
  SHIPMENT_TRACKING_STATUS,
  type ShipmentTrackingStatus,
} from '@/lib/constants/statuses';

export interface IAirFreight extends mongoose.Document {
  tenantId: string;
  flightNumber: string;
  airline: string;
  origin: string;
  destination: string;
  departureTime: Date;
  arrivalTime: Date;
  status: ShipmentTrackingStatus;
  cargo: number;
  cargoUnit: string;
  aircraftType?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AirFreightSchema = new Schema<IAirFreight>({
  tenantId: { type: String, required: true, index: true },
  flightNumber: { type: String, required: true },
  airline: { type: String, required: true },
  origin: { type: String, required: true },
  destination: { type: String, required: true },
  departureTime: { type: Date, required: true },
  arrivalTime: { type: Date, required: true },
  status: { 
    type: String, 
    enum: SHIPMENT_TRACKING_STATUS_VALUES,
    default: SHIPMENT_TRACKING_STATUS.SCHEDULED
  },
  cargo: { type: Number, required: true },
  cargoUnit: { type: String, default: 'kg' },
  aircraftType: { type: String },
  notes: { type: String },
}, {
  timestamps: true,
});

AirFreightSchema.index({ tenantId: 1, departureTime: -1 });
AirFreightSchema.index({ tenantId: 1, createdAt: 1 });

const AirFreight: Model<IAirFreight> =
  (models.AirFreight as Model<IAirFreight>) ||
  model<IAirFreight>('AirFreight', AirFreightSchema);

export default AirFreight;

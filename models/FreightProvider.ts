import mongoose, { Schema, models, model, Model } from 'mongoose';
import {
  ENTITY_STATUS,
  ENTITY_STATUS_VALUES,
  type EntityStatus,
} from '@/lib/constants/statuses';

export interface IFreightProvider extends mongoose.Document {
  tenantId: string;
  providerName: string;
  providerCode: string;
  providerType: 'air' | 'sea' | 'road' | 'rail' | 'multimodal';
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  website?: string;
  servicesOffered: string[];
  coverage: string[];
  rateStructure?: {
    baseRate: number;
    currency: string;
    perKg?: number;
    perCbm?: number;
  };
  status: EntityStatus;
  rating?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FreightProviderSchema = new Schema<IFreightProvider>({
  tenantId: { type: String, required: true, index: true },
  providerName: { type: String, required: true },
  providerCode: { type: String, required: true, unique: true },
  providerType: { type: String, enum: ['air', 'sea', 'road', 'rail', 'multimodal'], required: true },
  contactPerson: { type: String, required: true },
  contactEmail: { type: String, required: true },
  contactPhone: { type: String, required: true },
  website: { type: String },
  servicesOffered: [{ type: String }],
  coverage: [{ type: String }],
  rateStructure: {
    baseRate: { type: Number },
    currency: { type: String, default: 'USD' },
    perKg: { type: Number },
    perCbm: { type: Number },
  },
  status: { type: String, enum: ENTITY_STATUS_VALUES, default: ENTITY_STATUS.ACTIVE },
  rating: { type: Number, min: 0, max: 5 },
  notes: { type: String },
}, { timestamps: true });

const FreightProvider: Model<IFreightProvider> =
  (models.FreightProvider as Model<IFreightProvider>) ||
  model<IFreightProvider>('FreightProvider', FreightProviderSchema);
export default FreightProvider;

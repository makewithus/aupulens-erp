import mongoose, { Schema, models, model, Model } from 'mongoose';
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from '@/lib/constants/statuses';

export interface ICustomsClearance extends mongoose.Document {
  tenantId: string;
  clearanceNumber: string;
  shipmentId: mongoose.Types.ObjectId;
  shipmentNumber: string;
  customsOffice: string;
  country: string;
  declarationType: 'import' | 'export' | 'transit';
  totalValue: number;
  currency: string;
  totalDuty: number;
  totalTax: number;
  status: DocumentStatus;
  submittedDate?: string;
  clearedDate?: string;
  documents: Array<{
    documentType: string;
    documentNumber: string;
    uploadedAt: Date;
  }>;
  items: Array<{
    description: string;
    hsCode: string;
    quantity: number;
    value: number;
    dutyRate: number;
    taxRate: number;
    dutyAmount: number;
    taxAmount: number;
  }>;
  remarks?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomsClearanceSchema = new Schema<ICustomsClearance>({
  tenantId: { type: String, required: true, index: true },
  clearanceNumber: { type: String, required: true },
  shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment' },
  shipmentNumber: { type: String, required: true },
  customsOffice: { type: String, required: true },
  country: { type: String, required: true },
  declarationType: { type: String, enum: ['import', 'export', 'transit'], required: true },
  totalValue: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  totalDuty: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: DOCUMENT_STATUS_VALUES, 
    default: DOCUMENT_STATUS.DRAFT 
  },
  submittedDate: { type: String },
  clearedDate: { type: String },
  documents: [{
    documentType: { type: String, required: true },
    documentNumber: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  }],
  items: [{
    description: { type: String, required: true },
    hsCode: { type: String, required: true },
    quantity: { type: Number, required: true },
    value: { type: Number, required: true },
    dutyRate: { type: Number, required: true },
    taxRate: { type: Number, required: true },
    dutyAmount: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
  }],
  remarks: { type: String },
  notes: { type: String },
}, { timestamps: true });

// Compound with tenantId per Golden Rule #7 — clearance numbers only need to
// be unique within a tenant, not globally across the whole platform.
CustomsClearanceSchema.index({ tenantId: 1, clearanceNumber: 1 }, { unique: true });

const CustomsClearance: Model<ICustomsClearance> =
  (models.CustomsClearance as Model<ICustomsClearance>) ||
  model<ICustomsClearance>('CustomsClearance', CustomsClearanceSchema);
export default CustomsClearance;

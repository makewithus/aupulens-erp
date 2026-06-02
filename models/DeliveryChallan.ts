import mongoose, { Schema, models, model, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IDeliveryChallan extends mongoose.Document {
  tenantId: string;
  dcNumber: string;
  customer: string;
  customerEmail?: string;
  items: Array<{
    description: string;
    quantity: number;
    unit: string;
  }>;
  deliveryAddress: string;
  vehicleNumber?: string;
  driverName?: string;
  deliveryDate?: string;
  status: DocumentStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryChallanSchema = new Schema<IDeliveryChallan>(
  {
  tenantId: { type: String, required: true, index: true },
    dcNumber: { type: String, required: true, unique: true },
    customer: { type: String, required: true },
    customerEmail: { type: String },
    items: [
      {
        productId: { type: Schema.Types.ObjectId, ref: "Product" },
        description: { type: String, required: true },
        quantity: { type: Number, required: true },
        unit: { type: String, required: true },
      },
    ],
    deliveryAddress: { type: String, required: true },
    vehicleNumber: { type: String },
    driverName: { type: String },
    deliveryDate: { type: String },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    notes: { type: String },
  },
  { timestamps: true },
);

const DeliveryChallan: Model<IDeliveryChallan> =
  (models.DeliveryChallan as Model<IDeliveryChallan>) ||
  model<IDeliveryChallan>("DeliveryChallan", DeliveryChallanSchema);
export default DeliveryChallan;

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
  status: "pending" | "issued" | "delivered";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryChallanSchema = new Schema<IDeliveryChallan>(
  {
  tenantId: { type: String, required: true, index: true },
    dcNumber: { type: String, required: true },
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
      enum: ["pending", "issued", "delivered"],
      default: "pending",
    },
    notes: { type: String },
  },
  { timestamps: true },
);

DeliveryChallanSchema.index({ tenantId: 1, dcNumber: 1 }, { unique: true });
// Sales summary's draft-count and the default delivery-challans list both
// filter/sort on these fields with no prior compound-index coverage at all
// (only the unique dcNumber index existed).
DeliveryChallanSchema.index({ tenantId: 1, status: 1 });
DeliveryChallanSchema.index({ tenantId: 1, createdAt: -1 });

const DeliveryChallan: Model<IDeliveryChallan> =
  (models.DeliveryChallan as Model<IDeliveryChallan>) ||
  model<IDeliveryChallan>("DeliveryChallan", DeliveryChallanSchema);
export default DeliveryChallan;

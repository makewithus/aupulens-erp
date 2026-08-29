import mongoose, { Schema, Document, Model } from "mongoose";

// Tenant-wide catalog of delivery methods (Sales Orders "Delivery Method"
// combobox — "Select a delivery method or type to add"). No such catalog
// existed before; typing a new one here persists it for future orders,
// mirroring how TaxRate/DocumentPrefix work as simple per-tenant catalogs.
export interface IDeliveryMethod extends Document {
  tenantId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryMethodSchema = new Schema<IDeliveryMethod>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

DeliveryMethodSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const DeliveryMethod: Model<IDeliveryMethod> =
  (mongoose.models.DeliveryMethod as Model<IDeliveryMethod>) ||
  mongoose.model<IDeliveryMethod>("DeliveryMethod", DeliveryMethodSchema);

export default DeliveryMethod;

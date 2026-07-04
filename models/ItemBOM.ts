import mongoose, { Schema, Document, Model } from "mongoose";

export interface IItemBOM extends Document {
  tenantId: string;
  name: string;
  bomNumber: string;
  itemToProduceId: mongoose.Types.ObjectId;
  quantity: number;
  description?: string;
  components: {
    itemId: mongoose.Types.ObjectId;
    quantity: number;
    unit?: string;
  }[];
  operations: {
    name: string;
    duration?: number;
    notes?: string;
  }[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ItemBOMSchema = new Schema<IItemBOM>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    bomNumber: { type: String, required: true, trim: true },
    itemToProduceId: {
      type: Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    quantity: { type: Number, required: true, default: 1 },
    description: { type: String, trim: true, maxlength: 500 },
    components: [
      {
        itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
        quantity: { type: Number, required: true, default: 1 },
        unit: { type: String, trim: true },
      },
    ],
    operations: [
      {
        name: { type: String, trim: true },
        duration: { type: Number },
        notes: { type: String, trim: true },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ItemBOMSchema.index({ tenantId: 1, bomNumber: 1 }, { unique: true });
ItemBOMSchema.index({ tenantId: 1, itemToProduceId: 1 });

const ItemBOM: Model<IItemBOM> =
  (mongoose.models.ItemBOM as Model<IItemBOM>) ||
  mongoose.model<IItemBOM>("ItemBOM", ItemBOMSchema);

export default ItemBOM;

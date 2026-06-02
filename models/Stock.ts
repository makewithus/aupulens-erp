import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStock extends Document {
  product: mongoose.Types.ObjectId;
  quantity: number;
  type: "in" | "out" | "adjustment";
  reference: string;
  notes?: string;
  warehouse?: string; // Optional for now
  isReserved?: boolean;
  tenantId?: string;
  createdBy?: mongoose.Types.ObjectId;
}

const StockSchema: Schema<IStock> = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    type: {
      type: String,
      enum: ["in", "out", "adjustment"],
      required: true,
    },
    reference: { type: String, required: true }, // e.g., "INV-001", "Manual Integration"
    notes: { type: String },
    warehouse: { type: String },
    isReserved: { type: Boolean, default: false }, // For virtual stock reservations
    tenantId: { type: String, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

StockSchema.index({ product: 1, tenantId: 1 });

const Stock: Model<IStock> =
  (mongoose.models.Stock as Model<IStock>) ||
  mongoose.model<IStock>("Stock", StockSchema);

export default Stock;

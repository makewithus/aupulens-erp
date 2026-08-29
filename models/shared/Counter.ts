import mongoose, { Schema, Document, Model } from "mongoose";

// Generic tenant-scoped atomic sequence counter. Used wherever race-safe
// number generation is needed (e.g. invoice numbering per prefix).
export interface ICounter extends Document {
  tenantId: string;
  key: string; // e.g. `invoice:INV-`
  seq: number;
  createdAt: Date;
  updatedAt: Date;
}

const CounterSchema = new Schema<ICounter>(
  {
    tenantId: { type: String, required: true },
    key: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true },
);

CounterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

const Counter: Model<ICounter> =
  (mongoose.models.Counter as Model<ICounter>) ||
  mongoose.model<ICounter>("Counter", CounterSchema);

export default Counter;

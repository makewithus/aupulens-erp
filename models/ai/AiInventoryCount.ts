import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * A human-entered physical inventory count (docs/ai/BRIEF-08a-BATCH-G.md, AI-11 detection set
 * item 3). No stocktake/cycle-count model exists anywhere in this codebase (confirmed by grep,
 * not assumed) — this is the minimal, honest record a count needs so AI-11 can compare it against
 * the real `Stock` ledger and propose an adjustment. **AI-11 never writes here** — a count is a
 * physical act only a human performs; this collection is written by whatever future route/UI
 * captures a count, and read-only from AI-11's side.
 */

export interface IAiInventoryCount extends Document {
  tenantId: string;
  productId: mongoose.Types.ObjectId;
  warehouse?: string;
  countedQty: number;
  countedAt: Date;
  countedBy?: mongoose.Types.ObjectId;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AiInventoryCountSchema: Schema<IAiInventoryCount> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    warehouse: { type: String },
    countedQty: { type: Number, required: true },
    countedAt: { type: Date, required: true },
    countedBy: { type: Schema.Types.ObjectId, ref: "User" },
    note: { type: String },
  },
  { timestamps: true },
);

AiInventoryCountSchema.index({ tenantId: 1, productId: 1, countedAt: -1 });

const AiInventoryCount: Model<IAiInventoryCount> =
  (mongoose.models.AiInventoryCount as Model<IAiInventoryCount>) || mongoose.model<IAiInventoryCount>("AiInventoryCount", AiInventoryCountSchema);

export default AiInventoryCount;

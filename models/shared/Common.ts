import { Schema } from "mongoose";

// Messaging/Chatter for multi-user comments
export const MessageSchema = new Schema({
  authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true },
  type: { type: String, enum: ["comment", "notification"], default: "comment" },
  createdAt: { type: Date, default: Date.now },
});

// Logistics info for both Sales and Purchases
export const LogisticsSchema = new Schema({
  warehouseId: { type: Schema.Types.Mixed, ref: "Warehouse" }, // Changed to Mixed to allow flexible inputs or empty strings
  shippingPolicy: { type: String, enum: ["direct", "one"], default: "direct" }, // direct = deliver as soon as ready; one = deliver all at once
  incotermId: { type: Schema.Types.Mixed, ref: "Incoterm" }, // Changed to Mixed to prevent CastErrors on String values (e.g. codes)
  incotermLocation: { type: String },
  commitmentDate: { type: Date }, // Expected delivery date
});

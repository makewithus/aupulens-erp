import mongoose, { Schema, models, model, Model } from "mongoose";

export interface IPricelistItem {
  applied_on:
    | "3_global"
    | "2_product_category"
    | "1_product"
    | "0_product_variant";
  product_id?: mongoose.Types.ObjectId;
  categ_id?: mongoose.Types.ObjectId;
  compute_price: "fixed" | "percentage" | "formula";
  fixed_price?: number;
  percent_price?: number;
  min_quantity?: number;
  date_start?: Date;
  date_end?: Date;
}

export interface IPricelist extends mongoose.Document {
  tenantId: string;
  name: string;
  currencyId: string; // fallback to string for simplicity
  items: IPricelistItem[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PricelistItemSchema = new Schema<IPricelistItem>({
  applied_on: {
    type: String,
    enum: ["3_global", "2_product_category", "1_product", "0_product_variant"],
    default: "3_global",
  },
  product_id: { type: Schema.Types.ObjectId, ref: "Product" },
  categ_id: { type: Schema.Types.ObjectId }, // Assume category model exists or just use ID
  compute_price: {
    type: String,
    enum: ["fixed", "percentage", "formula"],
    default: "fixed",
  },
  fixed_price: { type: Number, default: 0 },
  percent_price: { type: Number, default: 0 },
  min_quantity: { type: Number, default: 0 },
  date_start: { type: Date },
  date_end: { type: Date },
});

const PricelistSchema = new Schema<IPricelist>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    currencyId: { type: String, default: "INR" },
    items: [PricelistItemSchema],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const Pricelist: Model<IPricelist> =
  (models.Pricelist as Model<IPricelist>) ||
  model<IPricelist>("Pricelist", PricelistSchema);
export default Pricelist;

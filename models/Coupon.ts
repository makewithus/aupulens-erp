import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICoupon extends Document {
  tenantId: string;
  name: string;
  couponCode: string;
  description?: string;
  discountType: "item-level" | "order-level";
  applicableProducts: "all" | "specific";
  specificProductIds: mongoose.Types.ObjectId[];
  applicableItems: "all" | "specific";
  specificItemIds: mongoose.Types.ObjectId[];
  redemptionType: "one-time" | "unlimited" | "limited";
  discountBy: "percentage" | "flat-rate";
  discountValue: number;
  currency: string;
  eligibleCustomers: "all" | "specific";
  specificCustomerIds: mongoose.Types.ObjectId[];
  minimumOrderAmount: number;
  maximumRedemptions: {
    type: "unlimited" | "limited";
    value?: number;
  };
  maximumRedemptionsPerCustomer: {
    type: "unlimited" | "limited";
    value?: number;
  };
  validFrom?: Date;
  validTill?: Date;
  neverExpires: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    couponCode: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String, trim: true },
    discountType: {
      type: String,
      enum: ["item-level", "order-level"],
      default: "item-level",
    },
    applicableProducts: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    specificProductIds: [{ type: Schema.Types.ObjectId, ref: "Item" }],
    applicableItems: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    specificItemIds: [{ type: Schema.Types.ObjectId, ref: "Item" }],
    redemptionType: {
      type: String,
      enum: ["one-time", "unlimited", "limited"],
      default: "one-time",
    },
    discountBy: {
      type: String,
      enum: ["percentage", "flat-rate"],
      default: "flat-rate",
    },
    discountValue: { type: Number, required: true, default: 0 },
    currency: { type: String, default: "INR" },
    eligibleCustomers: {
      type: String,
      enum: ["all", "specific"],
      default: "all",
    },
    specificCustomerIds: [{ type: Schema.Types.ObjectId, ref: "Customer" }],
    minimumOrderAmount: { type: Number, default: 0 },
    maximumRedemptions: {
      type: { type: String, enum: ["unlimited", "limited"], default: "unlimited" },
      value: { type: Number },
    },
    maximumRedemptionsPerCustomer: {
      type: { type: String, enum: ["unlimited", "limited"], default: "unlimited" },
      value: { type: Number },
    },
    validFrom: { type: Date },
    validTill: { type: Date },
    neverExpires: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

CouponSchema.index({ tenantId: 1, couponCode: 1 }, { unique: true });
CouponSchema.index({ tenantId: 1, name: 1 });

const Coupon: Model<ICoupon> =
  (mongoose.models.Coupon as Model<ICoupon>) ||
  mongoose.model<ICoupon>("Coupon", CouponSchema);

export default Coupon;

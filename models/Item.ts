import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IItem extends Document {
  tenantId: string;
  name: string;
  type: "goods" | "service";
  category?: string;
  brand?: string;
  manufacturer?: string;
  images: {
    frontView?: string;
    rearView?: string;
    others: string[];
  };
  itemType: "single" | "variants";
  unit: string;
  sku?: string;
  identifiers: { identifierType: string; value: string }[];
  description?: string;
  salesInfo: {
    enabled: boolean;
    sellingPrice?: number;
    currency: string;
    accountId?: mongoose.Types.ObjectId;
    description?: string;
  };
  purchaseInfo: {
    enabled: boolean;
    costPrice?: number;
    currency: string;
    accountId?: mongoose.Types.ObjectId;
    description?: string;
    preferredVendorId?: mongoose.Types.ObjectId;
  };
  inventoryTracking: {
    enabled: boolean;
    inventoryAccountId?: mongoose.Types.ObjectId;
    valuationMethod: "fifo" | "average" | "lifo";
    grniAccountId?: mongoose.Types.ObjectId;
    reorderPoint?: number;
  };
  fulfillment: {
    length?: number;
    width?: number;
    height?: number;
    dimensionUnit: "cm" | "in" | "mm" | "ft";
    weight?: number;
    weightUnit: "kg" | "lbs";
  };
  status: DocumentStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema<IItem>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["goods", "service"], default: "goods" },
    category: { type: String, trim: true },
    brand: { type: String, trim: true },
    manufacturer: { type: String, trim: true },
    images: {
      frontView: { type: String },
      rearView: { type: String },
      others: [{ type: String }],
    },
    itemType: { type: String, enum: ["single", "variants"], default: "single" },
    unit: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    identifiers: [
      {
        identifierType: { type: String, trim: true },
        value: { type: String, trim: true },
      },
    ],
    description: { type: String, trim: true },
    salesInfo: {
      enabled: { type: Boolean, default: true },
      sellingPrice: { type: Number },
      currency: { type: String, default: "INR" },
      accountId: { type: Schema.Types.ObjectId, ref: "Account" },
      description: { type: String },
    },
    purchaseInfo: {
      enabled: { type: Boolean, default: true },
      costPrice: { type: Number },
      currency: { type: String, default: "INR" },
      accountId: { type: Schema.Types.ObjectId, ref: "Account" },
      description: { type: String },
      preferredVendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
    },
    inventoryTracking: {
      enabled: { type: Boolean, default: true },
      inventoryAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
      valuationMethod: {
        type: String,
        enum: ["fifo", "average", "lifo"],
        default: "fifo",
      },
      grniAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
      reorderPoint: { type: Number },
    },
    fulfillment: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number },
      dimensionUnit: {
        type: String,
        enum: ["cm", "in", "mm", "ft"],
        default: "cm",
      },
      weight: { type: Number },
      weightUnit: { type: String, enum: ["kg", "lbs"], default: "kg" },
    },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

ItemSchema.index({ tenantId: 1, name: 1 });
ItemSchema.index({ tenantId: 1, sku: 1 }, { unique: true, sparse: true });
ItemSchema.index({ tenantId: 1, status: 1 });

const Item: Model<IItem> =
  (mongoose.models.Item as Model<IItem>) ||
  mongoose.model<IItem>("Item", ItemSchema);

export default Item;

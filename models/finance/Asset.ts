import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export type AssetStatus = DocumentStatus | "running";
export const ASSET_STATUS_VALUES = [...DOCUMENT_STATUS_VALUES, "running"] as const;

export interface IAsset extends Document {
  name: string;
  purchaseDate: Date;
  originalValue: number;
  salvageValue: number;
  method: "linear" | "degressive";
  durationYears: number;
  accounts: {
    assetAccountId: mongoose.Types.ObjectId;
    depreciationAccountId: mongoose.Types.ObjectId;
    fundingAccountId?: mongoose.Types.ObjectId;
  };
  status: AssetStatus;
  chatter: any[];
  tenantId: string;
  isDemo?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema = new Schema<IAsset>(
  {
    name: { type: String, required: true },
    purchaseDate: { type: Date, required: true },
    originalValue: { type: Number, required: true },
    salvageValue: { type: Number, default: 0 },
    method: {
      type: String,
      enum: ["linear", "degressive"],
      default: "linear",
    },
    durationYears: { type: Number, required: true },
    accounts: {
      assetAccountId: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        required: true,
      },
      depreciationAccountId: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        required: true,
      },
      fundingAccountId: {
        type: Schema.Types.ObjectId,
        ref: "Account",
        required: false,
      },
    },
    status: {
      type: String,
      enum: ASSET_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    chatter: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        body: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    tenantId: { type: String, required: true, immutable: true },
    isDemo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

AssetSchema.index({ tenantId: 1, purchaseDate: 1 });

const Asset: Model<IAsset> =
  (mongoose.models.Asset as Model<IAsset>) ||
  mongoose.model<IAsset>("Asset", AssetSchema);

export default Asset;

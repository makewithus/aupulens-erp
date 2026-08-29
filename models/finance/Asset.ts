import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

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
  };
  status: DocumentStatus;
  chatter: any[];
  tenantId: string;
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
    },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    chatter: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        body: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    tenantId: { type: String, required: true },
  },
  { timestamps: true },
);

const Asset: Model<IAsset> =
  (mongoose.models.Asset as Model<IAsset>) ||
  mongoose.model<IAsset>("Asset", AssetSchema);

export default Asset;

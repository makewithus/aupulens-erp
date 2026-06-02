import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IStockTransfer extends Document {
  header: {
    name: string;
    partnerId?: mongoose.Types.ObjectId;
    operationType: "incoming" | "outgoing" | "internal";
    scheduledDate: Date;
    sourceDocument?: string;
  };
  operations_tab: {
    productId: mongoose.Types.ObjectId;
    demand: number;
    done: number;
    uomId?: mongoose.Types.ObjectId;
  }[];
  additional_info: {
    responsibleId?: mongoose.Types.ObjectId;
    shippingPolicy?: "direct" | "one";
    note?: string;
  };
  /* ── Stock Inward (incoming) workflow fields ── */
  qcStatus?: "pending" | "passed" | "failed";
  qcNotes?: string;
  grnNumber?: string;
  grnDate?: Date;
  financeNotified?: boolean;
  /* ── Stock Outward (outgoing) workflow fields ── */
  inventoryChecked?: boolean;
  pickStatus?: "pending" | "picked";
  packStatus?: "pending" | "packed";
  dispatchStatus?: "pending" | "dispatched";
  dispatchDate?: Date;
  backorderCreated?: boolean;
  status: DocumentStatus;
  chatter: {
    authorId: mongoose.Types.ObjectId;
    body: string;
    type: "comment" | "notification";
    createdAt: Date;
  }[];
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

const StockTransferSchema: Schema<IStockTransfer> = new Schema(
  {
    header: {
      name: { type: String, required: true, unique: true },
      partnerId: { type: Schema.Types.ObjectId, ref: "Customer" }, // Vendor or Customer
      operationType: {
        type: String,
        enum: ["incoming", "outgoing", "internal"],
        required: true,
      },
      scheduledDate: { type: Date, default: Date.now },
      sourceDocument: { type: String },
    },
    operations_tab: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        demand: { type: Number, required: true },
        done: { type: Number, default: 0 },
        uomId: { type: Schema.Types.ObjectId, ref: "Uom" },
      },
    ],
    additional_info: {
      responsibleId: { type: Schema.Types.ObjectId, ref: "User" },
      shippingPolicy: {
        type: String,
        enum: ["direct", "one"],
        default: "direct",
      },
      projectId: { type: Schema.Types.ObjectId, ref: "Project" },
      note: { type: String },
    },
    /* ── Stock Inward (incoming) workflow ── */
    qcStatus: {
      type: String,
      enum: ["pending", "passed", "failed"],
      default: "pending",
    },
    qcNotes: { type: String },
    grnNumber: { type: String },
    grnDate: { type: Date },
    financeNotified: { type: Boolean, default: false },

    /* ── Stock Outward (outgoing) workflow ── */
    inventoryChecked: { type: Boolean, default: false },
    pickStatus: {
      type: String,
      enum: ["pending", "picked"],
      default: "pending",
    },
    packStatus: {
      type: String,
      enum: ["pending", "packed"],
      default: "pending",
    },
    dispatchStatus: {
      type: String,
      enum: ["pending", "dispatched"],
      default: "pending",
    },
    dispatchDate: { type: Date },
    backorderCreated: { type: Boolean, default: false },

    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    chatter: [
      {
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        body: { type: String },
        type: { type: String, enum: ["comment", "notification"] },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    tenantId: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

const StockTransfer: Model<IStockTransfer> =
  (mongoose.models.StockTransfer as Model<IStockTransfer>) ||
  mongoose.model<IStockTransfer>("StockTransfer", StockTransferSchema);

export default StockTransfer;

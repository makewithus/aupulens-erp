import mongoose, { Schema, models, model, Model } from "mongoose";
import { MessageSchema } from "./sub/Common";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
} from "@/lib/constants/statuses";

export interface IPurchaseOrderLine {
  productId: mongoose.Types.ObjectId;
  name: string;
  productQty: number;
  receivedQty: number;
  billedQty: number;
  priceUnit: number;
  taxIds: any[];
  priceSubtotal: number;
}

export interface IPurchaseOrder extends mongoose.Document {
  tenantId: string;
  name: string; // PO/2026/0001
  partnerId: mongoose.Types.ObjectId; // Supplier stored as Customer doc (Odoo res.partner pattern)
  dateOrder: Date;
  orderLines: IPurchaseOrderLine[];
  totals: {
    amountUntaxed: number;
    amountTax: number;
    amountTotal: number;
  };
  status: DocumentStatus;
  invoiceIds?: mongoose.Types.ObjectId[];
  stockMoveIds?: mongoose.Types.ObjectId[];
  stockTransferIds?: mongoose.Types.ObjectId[];
  chatter: any[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    // Vendors/suppliers are stored as Customer documents (Odoo res.partner pattern).
    // Do NOT change this ref to "Vendor" — the admin Vendor model is a separate entity
    // and all .populate("partnerId") calls expect Customer's field paths (header.name, etc.).
    partnerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    dateOrder: { type: Date, default: Date.now },
    orderLines: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        productQty: { type: Number, default: 1 },
        receivedQty: { type: Number, default: 0 },
        billedQty: { type: Number, default: 0 },
        priceUnit: { type: Number, required: true },
        taxIds: [{ type: Schema.Types.Mixed }],
        priceSubtotal: { type: Number, required: true },
      },
    ],
    totals: {
      amountUntaxed: { type: Number, default: 0 },
      amountTax: { type: Number, default: 0 },
      amountTotal: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    invoiceIds: [{ type: Schema.Types.ObjectId, ref: "Invoice" }],
    stockMoveIds: [{ type: Schema.Types.ObjectId, ref: "StockMove" }],
    stockTransferIds: [{ type: Schema.Types.ObjectId, ref: "StockTransfer" }],
    chatter: [MessageSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

PurchaseOrderSchema.index({ tenantId: 1, name: 1 }, { unique: true });
PurchaseOrderSchema.index({ partnerId: 1 });
PurchaseOrderSchema.index({ status: 1 });

const PurchaseOrder: Model<IPurchaseOrder> =
  (models.PurchaseOrder as Model<IPurchaseOrder>) ||
  model<IPurchaseOrder>("PurchaseOrder", PurchaseOrderSchema);

export default PurchaseOrder;

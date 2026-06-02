import mongoose, { Schema, models, model, Model } from "mongoose";
import { MessageSchema, LogisticsSchema } from "./sub/Common";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
  Q2C_STATUS_VALUES,
  Q2C_STATUS,
  type Q2CStatus,
} from "@/lib/constants/statuses";

export interface ISaleOrderLine {
  productId: mongoose.Types.ObjectId;
  name: string;
  productQty: number;
  priceUnit: number;
  taxIds: any[];
  discount: number;
  priceSubtotal: number;
}

export interface ISaleOrder extends mongoose.Document {
  tenantId?: any; // Changed to any for Mixed type support
  header: {
    name: string;
    partnerId: mongoose.Types.ObjectId;
    validityDate?: Date;
    dateOrder: Date;
    pricelistId?: any;
    paymentTermId?: any;
  };
  orderLines: ISaleOrderLine[];
  otherInfo: {
    salespersonId?: mongoose.Types.ObjectId;
    teamId?: any;
    clientOrderRef?: string;
    logistics?: any;
    tracking?: {
      campaignId?: any;
      mediumId?: any;
      sourceId?: any;
    };
    fiscalPositionId?: any;
  };
  totals: {
    amountUntaxed: number;
    amountTax: number;
    amountTotal: number;
  };
  status: DocumentStatus;
  q2cStatus: Q2CStatus;
  discountApproval?: {
    required: boolean;
    maxDiscountPercent?: number;
    approvedBy?: mongoose.Types.ObjectId;
    approvedAt?: Date;
    rejectedBy?: mongoose.Types.ObjectId;
    rejectedAt?: Date;
    reason?: string;
  };
  fulfillment?: {
    triggeredAt?: Date;
    triggeredBy?: mongoose.Types.ObjectId;
    deliveryChallanId?: mongoose.Types.ObjectId;
    status?: string;
  };
  revenueRecognition?: {
    recognizedAt?: Date;
    recognizedBy?: mongoose.Types.ObjectId;
    amount?: number;
    method?: string;
  };
  opportunitySource?: string;
  leadScore?: number;
  invoiceIds?: mongoose.Types.ObjectId[];
  chatter: any[];
  createdAt: Date;
  updatedAt: Date;
}

const SaleOrderSchema = new Schema<ISaleOrder>(
  {
    tenantId: { type: Schema.Types.Mixed, index: true },
    header: {
      name: { type: String, required: true },
      partnerId: {
        type: Schema.Types.ObjectId,
        ref: "Customer",
        required: true,
      },
      validityDate: { type: Date },
      dateOrder: { type: Date, default: Date.now },
      pricelistId: { type: Schema.Types.Mixed },
      paymentTermId: { type: Schema.Types.Mixed },
    },
    orderLines: [
      {
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, required: true },
        productQty: { type: Number, default: 1 },
        priceUnit: { type: Number, required: true },
        taxIds: [{ type: Schema.Types.Mixed }],
        discount: { type: Number, default: 0 },
        priceSubtotal: { type: Number, required: true },
      },
    ],
    otherInfo: {
      salespersonId: { type: Schema.Types.ObjectId, ref: "User" },
      teamId: { type: Schema.Types.Mixed },
      clientOrderRef: { type: String },
      logistics: LogisticsSchema,
      tracking: {
        campaignId: { type: Schema.Types.Mixed },
        mediumId: { type: Schema.Types.Mixed },
        sourceId: { type: Schema.Types.Mixed },
      },
      fiscalPositionId: { type: Schema.Types.Mixed },
    },
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
    q2cStatus: {
      type: String,
      enum: Q2C_STATUS_VALUES,
      default: Q2C_STATUS.LEAD,
    },
    discountApproval: {
      required: { type: Boolean, default: false },
      maxDiscountPercent: { type: Number },
      approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
      approvedAt: { type: Date },
      rejectedBy: { type: Schema.Types.ObjectId, ref: "User" },
      rejectedAt: { type: Date },
      reason: { type: String },
    },
    fulfillment: {
      triggeredAt: { type: Date },
      triggeredBy: { type: Schema.Types.ObjectId, ref: "User" },
      deliveryChallanId: { type: Schema.Types.ObjectId, ref: "DeliveryChallan" },
      status: { type: String },
    },
    revenueRecognition: {
      recognizedAt: { type: Date },
      recognizedBy: { type: Schema.Types.ObjectId, ref: "User" },
      amount: { type: Number },
      method: { type: String },
    },
    opportunitySource: { type: String },
    leadScore: { type: Number, default: 0 },
    invoiceIds: [{ type: Schema.Types.ObjectId, ref: "Invoice" }],
    chatter: [MessageSchema],
  },
  { timestamps: true },
);

SaleOrderSchema.index({ tenantId: 1, "header.name": 1 }, { unique: true });
SaleOrderSchema.index({ "header.partnerId": 1 });
SaleOrderSchema.index({ status: 1 });
SaleOrderSchema.index({ q2cStatus: 1 });

const SaleOrder: Model<ISaleOrder> =
  (models.SaleOrder as Model<ISaleOrder>) ||
  model<ISaleOrder>("SaleOrder", SaleOrderSchema);
export default SaleOrder;

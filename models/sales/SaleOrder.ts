import mongoose, { Schema, models, model, Model } from "mongoose";
import { MessageSchema, LogisticsSchema } from "../shared/Common";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
  Q2C_STATUS_VALUES,
  Q2C_STATUS,
  type Q2CStatus,
  SALES_ORDER_STATUS_VALUES,
  SALES_ORDER_STATUS,
  type SalesOrderStatus,
  SALES_ORDER_SHIPMENT_STATUS_VALUES,
  SALES_ORDER_SHIPMENT_STATUS,
  type SalesOrderShipmentStatus,
  SALES_ORDER_INVOICING_STATUS_VALUES,
  SALES_ORDER_INVOICING_STATUS,
  type SalesOrderInvoicingStatus,
} from "@/lib/constants/statuses";

export interface ISaleOrderLine {
  productId?: mongoose.Types.ObjectId;
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

  // Zoho-style Sales Orders tab (Sales revamp Part 5) — purely additive,
  // kept separate from the legacy `status`/`q2cStatus`/`invoiceIds` fields
  // that the pre-existing /sales/orders Odoo-style page owns and depends on.
  salesOrderStatus?: SalesOrderStatus;
  shipmentStatus?: SalesOrderShipmentStatus;
  invoicingStatus?: SalesOrderInvoicingStatus;
  expectedShipmentDate?: Date;
  paymentTermsLabel?: string;
  deliveryMethod?: string;
  extraDiscount?: number;
  extraDiscountMode?: "percent" | "amount";
  taxMode?: "none" | "tds" | "tcs";
  taxId?: mongoose.Types.ObjectId;
  taxRate?: number;
  adjustment?: number;
  subTotal?: number;
  taxAmount?: number;
  customerNotes?: string;
  termsAndConditions?: string;
  attachments?: { name: string; url: string }[];
  salesInvoiceIds?: mongoose.Types.ObjectId[];
  customerViewed?: boolean;

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
        // Not required: the new Zoho-style Sales Orders form (Sales revamp
        // Part 5) allows freeform line-item names not tied to a catalog
        // Product, same as Quotes/Subscriptions' line items. The legacy
        // Odoo-style /sales/orders page always supplies a real product via
        // its own dropdown-only item picker, so this relaxation doesn't
        // change its behavior.
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
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

    // No schema-level defaults on these three: they must stay genuinely
    // absent on documents created by the pre-existing legacy /sales/orders
    // (Odoo-style) page, which shares this same Mongoose model/collection.
    // A `default:` here would silently apply to every SaleOrder.create()
    // regardless of which UI created it, making the two systems' rows
    // indistinguishable. The new Zoho-style route sets these explicitly.
    salesOrderStatus: { type: String, enum: SALES_ORDER_STATUS_VALUES },
    shipmentStatus: { type: String, enum: SALES_ORDER_SHIPMENT_STATUS_VALUES },
    invoicingStatus: { type: String, enum: SALES_ORDER_INVOICING_STATUS_VALUES },
    expectedShipmentDate: { type: Date },
    paymentTermsLabel: { type: String },
    deliveryMethod: { type: String },
    extraDiscount: { type: Number, default: 0 },
    extraDiscountMode: { type: String, enum: ["percent", "amount"], default: "amount" },
    taxMode: { type: String, enum: ["none", "tds", "tcs"], default: "none" },
    taxId: { type: Schema.Types.ObjectId, ref: "TaxRate" },
    taxRate: { type: Number, default: 0 },
    adjustment: { type: Number, default: 0 },
    subTotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    customerNotes: { type: String },
    termsAndConditions: { type: String },
    attachments: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    salesInvoiceIds: [{ type: Schema.Types.ObjectId, ref: "SalesInvoice" }],
    customerViewed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

SaleOrderSchema.index({ tenantId: 1, salesOrderStatus: 1 });

SaleOrderSchema.index({ tenantId: 1, "header.name": 1 }, { unique: true });
SaleOrderSchema.index({ "header.partnerId": 1 });
SaleOrderSchema.index({ tenantId: 1, status: 1 });
SaleOrderSchema.index({ tenantId: 1, q2cStatus: 1 });
SaleOrderSchema.index({ tenantId: 1, createdAt: -1 });
// The main Sales Orders list and the Q2C Pipeline board both filter by
// {tenantId, status:{$in:[...]}} and sort by createdAt — the existing
// {tenantId,status} index doesn't cover that sort, so it ran as a blocking
// in-memory sort over every matching order.
SaleOrderSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
SaleOrderSchema.index({ tenantId: 1, "header.dateOrder": 1 });

const SaleOrder: Model<ISaleOrder> =
  (models.SaleOrder as Model<ISaleOrder>) ||
  model<ISaleOrder>("SaleOrder", SaleOrderSchema);
export default SaleOrder;

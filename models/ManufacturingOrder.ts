import mongoose, { Schema, Document, Model } from "mongoose";
import {
  DOCUMENT_STATUS_VALUES,
  DOCUMENT_STATUS,
  type DocumentStatus,
  PRODUCTION_STATUS_VALUES,
  PRODUCTION_STATUS,
  type ProductionStatus,
} from "@/lib/constants/statuses";

export interface IManufacturingOrder extends Document {
  header: {
    name: string;
    productId: mongoose.Types.ObjectId;
    quantity: number;
    bomId?: mongoose.Types.ObjectId;
    scheduledDate?: Date;
    responsibleId?: mongoose.Types.ObjectId;
  };
  components_tab: {
    productId: mongoose.Types.ObjectId;
    toConsume: number;
    consumed: number;
  }[];
  miscellaneous: {
    operationTypeId?: string;
    source?: string;
    projectId?: string;
    notes?: string;
  };
  status: DocumentStatus;
  /** Plan-to-Produce flow status */
  productionStatus: ProductionStatus;
  /** Demand / forecast origin details */
  demandSource?: {
    type?: "forecast" | "sales_order" | "manual";
    referenceId?: string;
    forecastQty?: number;
    notes?: string;
  };
  /** Material reservation snapshot */
  materialReservation?: {
    reservedAt?: Date;
    reservedBy?: mongoose.Types.ObjectId;
    isFullyReserved?: boolean;
    shortages?: { productId: mongoose.Types.ObjectId; shortQty: number }[];
  };
  /** Material issue details */
  materialIssue?: {
    issuedAt?: Date;
    issuedBy?: mongoose.Types.ObjectId;
  };
  /** Quality-control result */
  qcDetails?: {
    inspectedAt?: Date;
    inspectedBy?: mongoose.Types.ObjectId;
    result?: "passed" | "failed";
    remarks?: string;
    defectRate?: number;
  };
  /** Rework tracking */
  reworkCount: number;
  reworkNotes?: string;
  /** Timestamp when the order reached Finished Goods */
  finishedAt?: Date;
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

const ManufacturingOrderSchema: Schema<IManufacturingOrder> = new Schema(
  {
    header: {
      name: { type: String, required: true }, // e.g., WH/MO/001
      productId: {
        type: Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: { type: Number, required: true },
      bomId: { type: Schema.Types.ObjectId, ref: "BillOfMaterial" },
      scheduledDate: { type: Date },
      responsibleId: { type: Schema.Types.ObjectId, ref: "User" },
    },
    components_tab: [
      {
        productId: { type: Schema.Types.ObjectId, ref: "Product" },
        toConsume: { type: Number, default: 0 },
        consumed: { type: Number, default: 0 },
      },
    ],
    miscellaneous: {
      operationTypeId: { type: String },
      source: { type: String },
      projectId: { type: String },
      notes: { type: String },
    },
    status: {
      type: String,
      enum: DOCUMENT_STATUS_VALUES,
      default: DOCUMENT_STATUS.DRAFT,
    },
    // ---- Plan-to-Produce flow ----
    productionStatus: {
      type: String,
      enum: PRODUCTION_STATUS_VALUES,
      default: PRODUCTION_STATUS.DEMAND_FORECAST,
    },
    demandSource: {
      type: {
        type: String,
        enum: ["forecast", "sales_order", "manual"],
      },
      referenceId: { type: String },
      forecastQty: { type: Number },
      notes: { type: String },
    },
    materialReservation: {
      reservedAt: { type: Date },
      reservedBy: { type: Schema.Types.ObjectId, ref: "User" },
      isFullyReserved: { type: Boolean, default: false },
      shortages: [
        {
          productId: { type: Schema.Types.ObjectId, ref: "Product" },
          shortQty: { type: Number, default: 0 },
        },
      ],
    },
    materialIssue: {
      issuedAt: { type: Date },
      issuedBy: { type: Schema.Types.ObjectId, ref: "User" },
    },
    qcDetails: {
      inspectedAt: { type: Date },
      inspectedBy: { type: Schema.Types.ObjectId, ref: "User" },
      result: { type: String, enum: ["passed", "failed"] },
      remarks: { type: String },
      defectRate: { type: Number, min: 0, max: 100 },
    },
    reworkCount: { type: Number, default: 0 },
    reworkNotes: { type: String },
    finishedAt: { type: Date },
    // ---- End Plan-to-Produce ----
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

const ManufacturingOrder: Model<IManufacturingOrder> =
  (mongoose.models.ManufacturingOrder as Model<IManufacturingOrder>) ||
  mongoose.model<IManufacturingOrder>(
    "ManufacturingOrder",
    ManufacturingOrderSchema,
  );

export default ManufacturingOrder;

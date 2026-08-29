import mongoose, { Schema, Document, model, Model } from "mongoose";
import { MessageSchema } from "./sub/Common";
import {
  STOCK_MOVE_STATUS,
  STOCK_MOVE_STATUS_VALUES,
  type StockMoveStatus,
} from "@/lib/constants/statuses";

// ── Interfaces ──

export interface IStockMoveLine {
  productId: mongoose.Types.ObjectId;
  productName: string;
  demand: number;
  done: number;
  uom: string;
  unitCost: number;
  totalValue: number;
}

export interface IStockMove extends Document {
  tenantId: string;
  reference: string;
  moveType: "internal" | "incoming" | "outgoing" | "adjustment";
  sourceLocation: {
    warehouseId?: mongoose.Types.ObjectId;
    warehouseName?: string;
    zone?: string;
    bin?: string;
  };
  destinationLocation: {
    warehouseId?: mongoose.Types.ObjectId;
    warehouseName?: string;
    zone?: string;
    bin?: string;
  };
  scheduledDate: Date;
  effectiveDate?: Date;
  lines: IStockMoveLine[];
  moveStatus: StockMoveStatus;
  valuation: {
    method: "standard" | "average" | "fifo";
    totalValue: number;
    updatedAt?: Date;
  };
  accounting: {
    journalEntryId?: mongoose.Types.ObjectId;
    debitAccount?: string;
    creditAccount?: string;
    createdAt?: Date;
  };
  sourceDocument?: string;
  responsibleId?: mongoose.Types.ObjectId;
  notes?: string;
  chatter: any[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ──

const StockMoveLineSchema = new Schema({
  productId: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: { type: String, required: true },
  demand: { type: Number, required: true, min: 0 },
  done: { type: Number, default: 0, min: 0 },
  uom: { type: String, default: "Units" },
  unitCost: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
});

const StockMoveSchema = new Schema<IStockMove>(
  {
    tenantId: { type: String, required: true, index: true },
    reference: { type: String, required: true },
    moveType: {
      type: String,
      enum: ["internal", "incoming", "outgoing", "adjustment"],
      required: true,
    },
    sourceLocation: {
      warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse" },
      warehouseName: { type: String },
      zone: { type: String },
      bin: { type: String },
    },
    destinationLocation: {
      warehouseId: { type: Schema.Types.ObjectId, ref: "Warehouse" },
      warehouseName: { type: String },
      zone: { type: String },
      bin: { type: String },
    },
    scheduledDate: { type: Date, default: Date.now },
    effectiveDate: { type: Date },
    lines: [StockMoveLineSchema],
    moveStatus: {
      type: String,
      enum: STOCK_MOVE_STATUS_VALUES,
      default: STOCK_MOVE_STATUS.REQUESTED,
    },
    valuation: {
      method: {
        type: String,
        enum: ["standard", "average", "fifo"],
        default: "standard",
      },
      totalValue: { type: Number, default: 0 },
      updatedAt: { type: Date },
    },
    accounting: {
      journalEntryId: { type: Schema.Types.ObjectId, ref: "JournalEntry" },
      debitAccount: { type: String },
      creditAccount: { type: String },
      createdAt: { type: Date },
    },
    sourceDocument: { type: String },
    responsibleId: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: String },
    chatter: [MessageSchema],
  },
  { timestamps: true },
);

StockMoveSchema.index({ tenantId: 1, reference: 1 }, { unique: true });
StockMoveSchema.index({ tenantId: 1, moveStatus: 1 });
StockMoveSchema.index({ tenantId: 1, moveType: 1 });
StockMoveSchema.index({ tenantId: 1, "sourceLocation.warehouseId": 1 });
StockMoveSchema.index({ tenantId: 1, "destinationLocation.warehouseId": 1 });
// The Stock Moves list (and Reports page's unfiltered fetch) sort by
// createdAt against {tenantId}/{tenantId,moveStatus}/{tenantId,moveType}
// filters — none of the indexes above cover that sort, so it ran as a
// blocking in-memory sort over the whole matching set.
StockMoveSchema.index({ tenantId: 1, createdAt: -1 });
StockMoveSchema.index({ tenantId: 1, moveStatus: 1, createdAt: -1 });
StockMoveSchema.index({ tenantId: 1, moveType: 1, createdAt: -1 });

const StockMove: Model<IStockMove> =
  (mongoose.models.StockMove as Model<IStockMove>) ||
  model<IStockMove>("StockMove", StockMoveSchema);
export default StockMove;

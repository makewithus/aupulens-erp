import mongoose, { Schema, Document, Model } from "mongoose";
import {
  SALES_VIEW_VISIBILITY_VALUES,
  SALES_VIEW_VISIBILITY,
  type SalesViewVisibility,
} from "@/lib/constants/statuses";

export interface ISalesViewCriterion {
  field: string;
  comparator: string;
  value: string;
}

// Saved list views (Customers "All Customers ▾" dropdown + "New View" builder).
// Modeled on models/crm/SavedView.ts's shape, kept as its own model since Sales
// views are scoped to Sales-module entities (customers today, more later).
export interface ISalesView extends Document {
  tenantId: string;
  entityType: string; // "customers" for now
  name: string;
  criteria: ISalesViewCriterion[];
  columns: string[];
  visibility: SalesViewVisibility;
  sharedWithUserIds?: mongoose.Types.ObjectId[];
  isFavorite: boolean;
  isSystem: boolean; // seeded default views (All Customers, Active Customers, ...)
  specialFilter?: string; // "duplicate" | "overdue" | "unpaid" — cross-collection filters the generic criteria interpreter can't express
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SalesViewSchema: Schema<ISalesView> = new Schema(
  {
    tenantId: { type: String, required: true },
    entityType: { type: String, required: true, default: "customers" },
    name: { type: String, required: true, trim: true },
    criteria: [
      {
        field: { type: String, required: true },
        comparator: { type: String, required: true },
        value: { type: String, default: "" },
      },
    ],
    columns: [{ type: String }],
    visibility: {
      type: String,
      enum: SALES_VIEW_VISIBILITY_VALUES,
      default: SALES_VIEW_VISIBILITY.ONLY_ME,
    },
    sharedWithUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isFavorite: { type: Boolean, default: false },
    isSystem: { type: Boolean, default: false },
    specialFilter: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

SalesViewSchema.index({ tenantId: 1, entityType: 1 });

const SalesView: Model<ISalesView> =
  (mongoose.models.SalesView as Model<ISalesView>) ||
  mongoose.model<ISalesView>("SalesView", SalesViewSchema);

export default SalesView;

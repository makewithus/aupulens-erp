import mongoose, { Schema, Document, Model } from "mongoose";

export interface ISavedView extends Document {
  tenantId: string;
  name: string;
  entity_type: string; // e.g., 'Leads', 'Accounts'
  owner_id: mongoose.Types.ObjectId;
  is_default: boolean;
  is_shared: boolean;
  filters: any; // Storing the complex filter rules from filterEngine
  columns: string[]; // Fields to display
  sort: { field: string; order: 1 | -1 };
  createdBy: mongoose.Types.ObjectId;
}

const SavedViewSchema = new Schema<ISavedView>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    entity_type: { type: String, required: true },
    owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
    is_default: { type: Boolean, default: false },
    is_shared: { type: Boolean, default: false },
    filters: { type: Schema.Types.Mixed, default: {} },
    columns: [{ type: String }],
    sort: {
      field: { type: String, default: "createdAt" },
      order: { type: Number, enum: [1, -1], default: -1 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

SavedViewSchema.index({ tenantId: 1, entity_type: 1 });
SavedViewSchema.index({ tenantId: 1, owner_id: 1 });

export default (mongoose.models.CrmSavedView as Model<ISavedView>) ||
  mongoose.model<ISavedView>("CrmSavedView", SavedViewSchema);

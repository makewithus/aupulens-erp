import mongoose, { Schema, Document, Model } from "mongoose";

export interface IIntegrationLink extends Document {
  tenantId: string;
  crmRecordType: string;
  crmRecordId: mongoose.Types.ObjectId;
  erpSystem: string;
  erpRecordId: string;
  lastSyncAt: Date;
  syncStatus: "Success" | "Failed" | "Pending";
  syncFailures: number;
  retryAttempts: number;
  errorMessage?: string;
  createdBy: mongoose.Types.ObjectId;
}

const IntegrationLinkSchema = new Schema<IIntegrationLink>(
  {
    tenantId: { type: String, required: true },
    crmRecordType: { type: String, required: true },
    crmRecordId: { type: Schema.Types.ObjectId, required: true },
    erpSystem: { type: String, required: true }, // e.g., "SAP", "NetSuite", "QuickBooks", "AupulensCore"
    erpRecordId: { type: String, required: true },
    lastSyncAt: { type: Date, default: Date.now },
    syncStatus: { type: String, enum: ["Success", "Failed", "Pending"], default: "Pending" },
    syncFailures: { type: Number, default: 0 },
    retryAttempts: { type: Number, default: 0 },
    errorMessage: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

IntegrationLinkSchema.index({ tenantId: 1, crmRecordType: 1, crmRecordId: 1 });
IntegrationLinkSchema.index({ tenantId: 1, syncStatus: 1 });

export default (mongoose.models.CrmIntegrationLink as Model<IIntegrationLink>) ||
  mongoose.model<IIntegrationLink>("CrmIntegrationLink", IntegrationLinkSchema);

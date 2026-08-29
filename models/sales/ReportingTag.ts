import mongoose, { Schema, Document, Model } from "mongoose";

// Definitions for the Customers "Reporting Tags" tab — a tenant-wide list of
// selectable tags (defined once, applied to many customers), rather than
// free-text per customer.
export interface IReportingTag extends Document {
  tenantId: string;
  name: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ReportingTagSchema: Schema<IReportingTag> = new Schema(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

ReportingTagSchema.index({ tenantId: 1, name: 1 }, { unique: true });

const ReportingTag: Model<IReportingTag> =
  (mongoose.models.ReportingTag as Model<IReportingTag>) ||
  mongoose.model<IReportingTag>("ReportingTag", ReportingTagSchema);

export default ReportingTag;

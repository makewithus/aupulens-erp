import mongoose, { Schema, Document, Model } from "mongoose";
import { JOURNAL_REPORTING_METHOD_VALUES, JOURNAL_REPORTING_METHOD } from "@/lib/constants/statuses";

export interface IJournalTemplateLine {
  accountId: mongoose.Types.ObjectId;
  description?: string;
  contactId?: mongoose.Types.ObjectId;
  type?: "debit" | "credit";
}

export interface IJournalTemplate extends Document {
  tenantId: string;
  templateName: string;
  referenceNumber?: string;
  notes: string;
  reportingMethod: string;
  currency: string;
  lines: IJournalTemplateLine[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JournalTemplateLineSchema = new Schema<IJournalTemplateLine>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    description: { type: String, trim: true },
    contactId: { type: Schema.Types.ObjectId, ref: "Customer" },
    type: { type: String, enum: ["debit", "credit"] },
  },
  { _id: false },
);

const JournalTemplateSchema: Schema<IJournalTemplate> = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    templateName: { type: String, required: true, trim: true },
    referenceNumber: { type: String, trim: true },
    notes: { type: String, required: true, maxlength: 500 },
    reportingMethod: {
      type: String,
      enum: JOURNAL_REPORTING_METHOD_VALUES,
      default: JOURNAL_REPORTING_METHOD.ACCRUAL_AND_CASH,
    },
    currency: { type: String, default: "INR" },
    lines: { type: [JournalTemplateLineSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

JournalTemplateSchema.index({ tenantId: 1, templateName: 1 }, { unique: true });

const JournalTemplate: Model<IJournalTemplate> =
  (mongoose.models.JournalTemplate as Model<IJournalTemplate>) ||
  mongoose.model<IJournalTemplate>("JournalTemplate", JournalTemplateSchema);

export default JournalTemplate;

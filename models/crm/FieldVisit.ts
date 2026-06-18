import mongoose, { Schema, Document, Model } from "mongoose";

export interface IFieldVisit extends Document {
  tenantId: string;
  recordType: string; // Account, Contact, Opportunity
  recordId: mongoose.Types.ObjectId;
  latitude: number;
  longitude: number;
  address?: string;
  visit_start: Date;
  visit_end?: Date;
  duration?: number; // minutes
  visit_notes?: string;
  customer_feedback?: string;
  location_notes?: string;
  status: "Checked In" | "Checked Out" | "Cancelled";
  createdBy: mongoose.Types.ObjectId;
}

const FieldVisitSchema = new Schema<IFieldVisit>(
  {
    tenantId: { type: String, required: true },
    recordType: { type: String, required: true, enum: ["Account", "Contact", "Opportunity", "Lead"] },
    recordId: { type: Schema.Types.ObjectId, required: true },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String },
    visit_start: { type: Date, required: true },
    visit_end: { type: Date },
    duration: { type: Number },
    visit_notes: { type: String },
    customer_feedback: { type: String },
    location_notes: { type: String },
    status: { type: String, enum: ["Checked In", "Checked Out", "Cancelled"], default: "Checked In" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

FieldVisitSchema.index({ tenantId: 1, recordType: 1, recordId: 1 });
FieldVisitSchema.index({ tenantId: 1, createdBy: 1, visit_start: -1 });

export default (mongoose.models.CrmFieldVisit as Model<IFieldVisit>) ||
  mongoose.model<IFieldVisit>("CrmFieldVisit", FieldVisitSchema);

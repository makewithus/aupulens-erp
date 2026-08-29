import mongoose, { Schema, Document, Model } from "mongoose";
import {
  LEAD_STATUS,
  LEAD_STATUS_VALUES,
  type LeadStatus,
} from "@/lib/crm/workflow";

export interface ILead extends Document {
  tenantId: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  source?: string;
  status: LeadStatus;
  score: number;
  estimatedValue: number;
  expectedCloseDate?: Date;
  ownerId?: mongoose.Types.ObjectId;
  convertedOpportunityId?: mongoose.Types.ObjectId;
  convertedCustomerId?: mongoose.Types.ObjectId;
  convertedAt?: Date;
  notes: {
    body: string;
    authorId?: mongoose.Types.ObjectId;
    createdAt: Date;
  }[];
  followUps: {
    dueDate: Date;
    body: string;
    completed: boolean;
    completedAt?: Date;
    completedBy?: mongoose.Types.ObjectId;
  }[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    source: { type: String, trim: true },
    status: {
      type: String,
      enum: LEAD_STATUS_VALUES,
      default: LEAD_STATUS.NEW,
      required: true,
    },
    score: { type: Number, default: 0, min: 0, max: 100 },
    estimatedValue: { type: Number, default: 0, min: 0 },
    expectedCloseDate: { type: Date },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    convertedOpportunityId: { type: Schema.Types.ObjectId, ref: "Opportunity" },
    convertedCustomerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    convertedAt: { type: Date },
    notes: [
      {
        body: { type: String, required: true, trim: true },
        authorId: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    followUps: [
      {
        dueDate: { type: Date, required: true },
        body: { type: String, required: true, trim: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date },
        completedBy: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

LeadSchema.index(
  { tenantId: 1, email: 1 },
  {
    partialFilterExpression: { email: { $exists: true, $type: "string" } },
  },
);
LeadSchema.index({ tenantId: 1, status: 1, updatedAt: -1 });
LeadSchema.index({ tenantId: 1, ownerId: 1 });

const Lead: Model<ILead> =
  (mongoose.models.Lead as Model<ILead>) ||
  mongoose.model<ILead>("Lead", LeadSchema);

export default Lead;

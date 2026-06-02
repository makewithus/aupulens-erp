import mongoose, { Schema, Document, Model } from "mongoose";
import {
  OPPORTUNITY_STAGE,
  OPPORTUNITY_STAGE_VALUES,
  type OpportunityStage,
} from "@/lib/crm/workflow";

export interface IOpportunity extends Document {
  tenantId: string;
  name: string;
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  amount: number;
  probability: number;
  stage: OpportunityStage;
  expectedCloseDate?: Date;
  sourceLeadId?: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
  ownerId?: mongoose.Types.ObjectId;
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
  convertedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const OpportunitySchema = new Schema<IOpportunity>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    contactName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    amount: { type: Number, default: 0, min: 0 },
    probability: { type: Number, default: 0, min: 0, max: 100 },
    stage: {
      type: String,
      enum: OPPORTUNITY_STAGE_VALUES,
      default: OPPORTUNITY_STAGE.QUALIFICATION,
      required: true,
    },
    expectedCloseDate: { type: Date },
    sourceLeadId: { type: Schema.Types.ObjectId, ref: "Lead" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
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
    convertedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

OpportunitySchema.index({ tenantId: 1, stage: 1, updatedAt: -1 });
OpportunitySchema.index({ tenantId: 1, ownerId: 1 });
OpportunitySchema.index({ tenantId: 1, sourceLeadId: 1 });
OpportunitySchema.index({ tenantId: 1, customerId: 1 });

const Opportunity: Model<IOpportunity> =
  (mongoose.models.Opportunity as Model<IOpportunity>) ||
  mongoose.model<IOpportunity>("Opportunity", OpportunitySchema);

export default Opportunity;

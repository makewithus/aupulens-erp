import mongoose, { Schema, Document, Model } from "mongoose";

export const FORECAST_CATEGORIES = ["Omitted", "Pipeline", "Best Case", "Commit", "Closed"] as const;
export type ForecastCategory = typeof FORECAST_CATEGORIES[number];

export interface IOpportunity extends Document {
  tenantId: string;
  name: string; // deal_name
  account_id?: mongoose.Types.ObjectId; // linked_account (Account)
  contacts?: mongoose.Types.ObjectId[]; // linked_contacts
  ownerId?: mongoose.Types.ObjectId; // owner
  stage: string;
  probability: number;
  amount: number;
  expected_close_date?: Date;
  source?: string;
  product_service_line?: string;
  competitors?: string[];
  priority?: "Low" | "Medium" | "High";
  next_action?: string;
  win_reason?: string;
  loss_reason?: string;
  forecast_category?: ForecastCategory;
  
  stakeholders?: {
    contactId: mongoose.Types.ObjectId;
    role: string;
  }[];
  
  stage_history?: {
    stage: string;
    enteredAt: Date;
    exitedAt?: Date;
    durationMs?: number;
    changedBy?: mongoose.Types.ObjectId;
  }[];
  
  attachments?: {
    name: string;
    url: string;
    uploadedAt: Date;
  }[];
  
  tags?: string[];

  // Legacy/Backwards compatibility fields
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  sourceLeadId?: mongoose.Types.ObjectId;
  customerId?: mongoose.Types.ObjectId;
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
    account_id: { type: Schema.Types.ObjectId, ref: "Account", index: true },
    contacts: [{ type: Schema.Types.ObjectId, ref: "Contact" }],
    ownerId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    stage: {
      type: String,
      default: "Prospecting",
      required: true,
    },
    probability: { type: Number, default: 10, min: 0, max: 100 },
    amount: { type: Number, default: 0, min: 0 },
    expected_close_date: { type: Date },
    source: { type: String, trim: true },
    product_service_line: { type: String, trim: true },
    competitors: [{ type: String }],
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    next_action: { type: String, trim: true },
    win_reason: { type: String },
    loss_reason: { type: String },
    forecast_category: { type: String, enum: FORECAST_CATEGORIES, default: "Pipeline" },
    
    stakeholders: [
      {
        contactId: { type: Schema.Types.ObjectId, ref: "Contact" },
        role: { type: String },
      }
    ],
    
    stage_history: [
      {
        stage: { type: String, required: true },
        enteredAt: { type: Date, default: Date.now },
        exitedAt: { type: Date },
        durationMs: { type: Number },
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
      }
    ],
    
    attachments: [
      {
        name: { type: String },
        url: { type: String },
        uploadedAt: { type: Date, default: Date.now },
      }
    ],
    
    tags: [{ type: String }],

    // Legacy fields
    companyName: { type: String, trim: true },
    contactName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    sourceLeadId: { type: Schema.Types.ObjectId, ref: "Lead" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
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

OpportunitySchema.index({ tenantId: 1, stage: 1 });
OpportunitySchema.index({ tenantId: 1, expected_close_date: 1 });

const Opportunity: Model<IOpportunity> =
  (mongoose.models.Opportunity as Model<IOpportunity>) ||
  mongoose.model<IOpportunity>("Opportunity", OpportunitySchema);

export default Opportunity;

import mongoose, { Schema, Document, Model } from "mongoose";

export interface ITask extends Document {
  tenantId: string;
  title: string;
  category?: string;
  description?: string;
  assigned_to_id: mongoose.Types.ObjectId;
  due_date: Date;
  priority: string;
  status: string;
  is_recurring: boolean;
  recurrence_rule?: string;
  next_occurrence?: Date;
  last_occurrence?: Date;
  completed_at?: Date;
  linked_lead_id?: mongoose.Types.ObjectId;
  linked_account_id?: mongoose.Types.ObjectId;
  linked_opportunity_id?: mongoose.Types.ObjectId;
  linked_case_id?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const TaskSchema = new Schema<ITask>({
  tenantId: { type: String, required: true },
  title: { type: String, required: true },
  category: { type: String, enum: ['Call Back','Send Proposal','Schedule Demo','Follow Up on Quote','Collect Documents','Renew Contract','Resolve Issue','Prepare Meeting','Follow Up','Prepare Quote','Onboarding','Other'] },
  description: { type: String },
  assigned_to_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  due_date: { type: Date, required: true },
  priority: { type: String, enum: ['Low','Medium','High','Urgent'], default: 'Medium' },
  status: { type: String, enum: ['Pending','In Progress','Completed','Overdue','Cancelled'], default: 'Pending' },
  is_recurring: { type: Boolean, default: false },
  recurrence_rule: { type: String },
  next_occurrence: { type: Date },
  last_occurrence: { type: Date },
  completed_at: { type: Date },
  linked_lead_id: { type: Schema.Types.ObjectId, ref: 'CrmLead' },
  linked_account_id: { type: Schema.Types.ObjectId, ref: 'CrmAccount' },
  linked_opportunity_id: { type: Schema.Types.ObjectId, ref: 'CrmOpportunity' },
  linked_case_id: { type: Schema.Types.ObjectId, ref: 'CrmCase' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

TaskSchema.index({ tenantId: 1, status: 1 });
TaskSchema.index({ tenantId: 1, assigned_to_id: 1, status: 1 });
TaskSchema.index({ tenantId: 1, due_date: 1 });

export default (mongoose.models.CrmTask as Model<ITask>) || mongoose.model<ITask>("CrmTask", TaskSchema);

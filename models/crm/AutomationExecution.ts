import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAutomationExecution extends Document {
  tenantId: string;
  ruleId: mongoose.Types.ObjectId;
  trigger: string;
  entity: string;
  entityId: mongoose.Types.ObjectId;
  status: string; // Pending, Running, Completed, Failed
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

const AutomationExecutionSchema = new Schema<IAutomationExecution>(
  {
    tenantId: { type: String, required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: "CrmAutomationRule", required: true },
    trigger: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ["Pending", "Running", "Completed", "Failed"],
      default: "Pending",
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

AutomationExecutionSchema.index({ tenantId: 1, ruleId: 1 });
AutomationExecutionSchema.index({ tenantId: 1, status: 1 });

export default (mongoose.models.CrmAutomationExecution as Model<IAutomationExecution>) ||
  mongoose.model<IAutomationExecution>("CrmAutomationExecution", AutomationExecutionSchema);

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWorkflowDefinition extends Document {
  tenantId: string;
  name: string;
  description?: string;
  entity: string;
  trigger: string;
  isActive: boolean;
  nodes: any[]; // Graph nodes for UI
  edges: any[]; // Graph edges for UI
  compiledActions: any[]; // Parsed instructions for backend execution engine
  createdBy: mongoose.Types.ObjectId;
}

const WorkflowDefinitionSchema = new Schema<IWorkflowDefinition>(
  {
    tenantId: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String },
    entity: { type: String, required: true }, // Lead, Account, etc.
    trigger: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    nodes: [{ type: Schema.Types.Mixed }],
    edges: [{ type: Schema.Types.Mixed }],
    compiledActions: [{ type: Schema.Types.Mixed }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export default (mongoose.models.CrmWorkflowDefinition as Model<IWorkflowDefinition>) ||
  mongoose.model<IWorkflowDefinition>("CrmWorkflowDefinition", WorkflowDefinitionSchema);

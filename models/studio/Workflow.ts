import mongoose, { Model, Schema } from "mongoose";
import { WORKFLOW_TRIGGER_TYPE, type WorkflowTriggerType } from "@/lib/studio/catalog";
import type { WorkflowCondition } from "@/lib/studio/conditions";

/**
 * A cross-module automation authored in Aupulens Studio: a trigger, optional
 * conditions, and an ordered list of action steps. `version` increments on every
 * save (simple version control); each run records the version it executed under.
 */

export interface IWorkflowStep {
  type: string; // WorkflowActionType
  params: Record<string, unknown>;
}

export interface IWorkflow extends mongoose.Document {
  tenantId: string;
  name: string;
  description?: string;
  triggerType: WorkflowTriggerType;
  eventKey?: string; // when triggerType === "event"
  conditions: WorkflowCondition[];
  steps: IWorkflowStep[];
  enabled: boolean;
  version: number;
  lastRunAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowSchema = new Schema<IWorkflow>(
  {
    tenantId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    triggerType: { type: String, enum: Object.values(WORKFLOW_TRIGGER_TYPE), default: WORKFLOW_TRIGGER_TYPE.MANUAL },
    eventKey: { type: String },
    conditions: { type: [Schema.Types.Mixed], default: [] } as any,
    steps: { type: [Schema.Types.Mixed], default: [] } as any,
    enabled: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    lastRunAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

WorkflowSchema.index({ tenantId: 1, createdAt: -1 });
// Fast lookup for event dispatch: enabled event-workflows by key.
WorkflowSchema.index({ tenantId: 1, triggerType: 1, eventKey: 1, enabled: 1 });

const Workflow: Model<IWorkflow> =
  (mongoose.models.Workflow as Model<IWorkflow>) ||
  mongoose.model<IWorkflow>("Workflow", WorkflowSchema);

export default Workflow;

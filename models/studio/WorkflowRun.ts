import mongoose, { Model, Schema } from "mongoose";

/**
 * One execution of a Workflow — the debugging/run history. Captures the version
 * run, the trigger source, per-step results, and overall status.
 */

export const WORKFLOW_RUN_STATUS = {
  SUCCESS: "success",
  FAILED: "failed",
  PARTIAL: "partial", // some steps ran, one failed
  SKIPPED: "skipped", // conditions not met
} as const;

export type WorkflowRunStatus =
  (typeof WORKFLOW_RUN_STATUS)[keyof typeof WORKFLOW_RUN_STATUS];

export interface IWorkflowStepResult {
  index: number;
  type: string;
  status: "success" | "failed" | "skipped";
  message?: string;
  durationMs?: number;
}

export interface IWorkflowRun extends mongoose.Document {
  tenantId: string;
  workflowId: mongoose.Types.ObjectId;
  workflowVersion: number;
  trigger: string; // "manual" | "event:<key>"
  status: WorkflowRunStatus;
  conditionsMet: boolean;
  stepResults: IWorkflowStepResult[];
  error?: string;
  createdAt: Date;
}

const WorkflowRunSchema = new Schema<IWorkflowRun>(
  {
    tenantId: { type: String, required: true, index: true },
    workflowId: { type: Schema.Types.ObjectId, ref: "Workflow", required: true, index: true },
    workflowVersion: { type: Number, default: 1 },
    trigger: { type: String, default: "manual" },
    status: { type: String, enum: Object.values(WORKFLOW_RUN_STATUS), required: true },
    conditionsMet: { type: Boolean, default: true },
    stepResults: { type: [Schema.Types.Mixed], default: [] } as any,
    error: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

WorkflowRunSchema.index({ tenantId: 1, workflowId: 1, createdAt: -1 });

const WorkflowRun: Model<IWorkflowRun> =
  (mongoose.models.WorkflowRun as Model<IWorkflowRun>) ||
  mongoose.model<IWorkflowRun>("WorkflowRun", WorkflowRunSchema);

export default WorkflowRun;

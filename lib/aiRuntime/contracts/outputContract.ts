import type { IAiWorkflowRun, IAiFinding } from "@/models/ai/AiWorkflowRun";
import type { AiAutonomyLevel, AiRunStatus } from "@/lib/constants/statuses";

/**
 * The Part 2.9 shared output envelope. Every workflow's result — UI, chat,
 * and the attention engine — consumes exactly this shape. `toEnvelope()` is
 * the only place that maps an `AiWorkflowRun` document to it, so the mapping
 * cannot drift between call sites.
 */
export interface WorkflowRunEnvelope {
  runId: string;
  workflowId: string;
  workflowVersion: string;
  entityId: string;
  status: AiRunStatus;
  autonomyApplied: AiAutonomyLevel;
  summary: string;
  findings: IAiFinding[];
  metrics: {
    scanned: number;
    matched: number;
    exceptions: number;
    autoActioned: number;
    policy_overrides: number;
  };
  nextRunHint?: "on_event" | "hourly" | "nightly" | "close_horizon";
}

export function toEnvelope(run: IAiWorkflowRun): WorkflowRunEnvelope {
  return {
    runId: String(run._id),
    workflowId: run.workflowId,
    workflowVersion: run.workflowVersion,
    entityId: run.entityId,
    status: run.status,
    autonomyApplied: run.autonomyApplied,
    summary: run.summary,
    findings: run.findings,
    metrics: run.metrics,
    nextRunHint: run.nextRunHint,
  };
}

/**
 * Aupulens Studio execution engine.
 *
 * `executeSteps` is the pure orchestration core: it evaluates conditions, runs
 * each step through an injected `ActionRunner` map, threads a mutable context so
 * one step's output can feed the next, and stops on the first hard failure
 * (recording it) — no DB, no network, fully unit-testable via fake runners.
 *
 * `runWorkflow` wires the real runners (see actions.ts) and persists a
 * WorkflowRun. It's the single entry point used by both the manual test-run
 * route and the event dispatcher.
 */

import {
  evaluateConditions,
  type WorkflowCondition,
} from "@/lib/studio/conditions";
import type { WorkflowRunStatus, IWorkflowStepResult } from "@/models/WorkflowRun";

export interface WorkflowStep {
  type: string;
  params: Record<string, unknown>;
}

export interface RunContext {
  tenantId: string;
  userId?: string;
  /** Mutable bag: seeded with { payload }, steps can read/write it. */
  vars: Record<string, unknown>;
}

/** An action runner returns a human-readable result message or throws to fail. */
export type ActionRunner = (
  params: Record<string, unknown>,
  ctx: RunContext,
) => Promise<string>;

export type ActionRunnerMap = Record<string, ActionRunner>;

export interface ExecutionResult {
  status: WorkflowRunStatus;
  conditionsMet: boolean;
  stepResults: IWorkflowStepResult[];
  error?: string;
}

export async function executeSteps(
  conditions: WorkflowCondition[],
  steps: WorkflowStep[],
  ctx: RunContext,
  runners: ActionRunnerMap,
): Promise<ExecutionResult> {
  const conditionsMet = evaluateConditions(conditions, ctx.vars);
  if (!conditionsMet) {
    return { status: "skipped", conditionsMet: false, stepResults: [] };
  }

  const stepResults: IWorkflowStepResult[] = [];
  let anyFailed = false;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const runner = runners[step.type];
    const start = Date.now();
    if (!runner) {
      stepResults.push({ index: i, type: step.type, status: "failed", message: `No runner for "${step.type}"`, durationMs: 0 });
      anyFailed = true;
      break;
    }
    try {
      const message = await runner(step.params || {}, ctx);
      stepResults.push({ index: i, type: step.type, status: "success", message, durationMs: Date.now() - start });
    } catch (err) {
      stepResults.push({
        index: i,
        type: step.type,
        status: "failed",
        message: err instanceof Error ? err.message : "Step failed",
        durationMs: Date.now() - start,
      });
      anyFailed = true;
      // Stop the chain on first failure — later steps often depend on earlier ones.
      break;
    }
  }

  const ranCount = stepResults.filter((r) => r.status === "success").length;
  const status: WorkflowRunStatus = anyFailed ? (ranCount > 0 ? "partial" : "failed") : "success";
  return { status, conditionsMet: true, stepResults, error: anyFailed ? stepResults.find((r) => r.status === "failed")?.message : undefined };
}

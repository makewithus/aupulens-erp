import connectDB from "@/lib/db";
import AiControlResult from "@/models/ai/AiControlResult";
import { CONTROL_DEFINITIONS } from "@/lib/aiRuntime/controls/definitions";
import { runAllControlDefinitions } from "@/lib/aiRuntime/controls/engine";
import { AI_TOOL_SIDE_EFFECT, AI_AUTONOMY_LEVEL } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";

/**
 * AI-29's tools (docs/ai/BRIEF-07-BATCH-F.md A.1/A.4). `run_control_tests` runs AI-29's own
 * `ControlDefinition` registry — the same "one engine, many definitions" shape as AI-22's
 * `run_tax_reconciliation`. `record_control_result` is the only write, `internal_state`, targets
 * only `AiControlResult`. Remediation itself is created via the already-registered `create_task`
 * tool — never a second task mechanism.
 */

export interface RunControlTestsArgs {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
}
async function runControlTestsHandler(args: RunControlTestsArgs) {
  const results = await runAllControlDefinitions(args.tenantId, CONTROL_DEFINITIONS, new Date(args.periodStart), new Date(args.periodEnd));
  return { results };
}

export interface RecordControlResultArgs {
  tenantId: string;
  controlId: string;
  period: string;
  status: "implemented" | "not_implemented" | "partial";
  reasonIfLimited?: string;
  populationSize: number;
  tested: number;
  passed: number;
  failed: number;
  failureRate: number;
  exceptions: unknown[];
  designConcern: boolean;
}
async function recordControlResultHandler(args: RecordControlResultArgs) {
  await connectDB();
  const doc = await AiControlResult.findOneAndUpdate(
    { tenantId: args.tenantId, controlId: args.controlId, period: args.period },
    {
      $set: {
        status: args.status,
        reasonIfLimited: args.reasonIfLimited,
        populationSize: args.populationSize,
        tested: args.tested,
        passed: args.passed,
        failed: args.failed,
        failureRate: args.failureRate,
        exceptions: args.exceptions,
        designConcern: args.designConcern,
        evaluatedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );
  return { id: String(doc._id) };
}

export function registerControlMonitoringReadTools(): void {
  registerTool<RunControlTestsArgs>({
    name: "run_control_tests",
    description: "Runs AI-29's ControlDefinition registry (lib/aiRuntime/controls/definitions.ts) for a period — one engine, many controls, same shape as AI-22's reconciliation engine.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: runControlTestsHandler,
  });
}

export function registerControlMonitoringWriteTools(): void {
  registerTool<RecordControlResultArgs>({
    name: "record_control_result",
    description: "Persists one control's test result for a period to models/ai/AiControlResult.ts — the trend history a design_concern verdict is derived from.",
    sideEffect: AI_TOOL_SIDE_EFFECT.EXECUTE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.EXECUTE,
    category: "internal_state",
    handler: recordControlResultHandler,
  });
}

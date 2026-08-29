/**
 * Event dispatch — the bridge from "something happened in the ERP" to "run the
 * workflows that listen for it". Any server code can call dispatchEvent(); it
 * finds enabled event-workflows for the tenant + key and runs each.
 *
 * Fire-and-forget by design: a workflow failure must never break the business
 * operation that emitted the event, so each run is isolated in try/catch and
 * failures are recorded on the WorkflowRun, not thrown back to the caller.
 */

import Workflow from "@/models/studio/Workflow";
import { WORKFLOW_TRIGGER_TYPE } from "@/lib/studio/catalog";
import { runWorkflow } from "@/lib/studio/actions";

export async function dispatchEvent(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
): Promise<{ matched: number; ran: number }> {
  const workflows = await Workflow.find({
    tenantId,
    triggerType: WORKFLOW_TRIGGER_TYPE.EVENT,
    eventKey,
    enabled: true,
  });

  let ran = 0;
  for (const wf of workflows) {
    try {
      await runWorkflow(wf, payload, { trigger: `event:${eventKey}` });
      ran += 1;
    } catch {
      // runWorkflow already records failures on the run; swallow so one bad
      // workflow can't break the emitting operation or the sibling workflows.
    }
  }
  return { matched: workflows.length, ran };
}

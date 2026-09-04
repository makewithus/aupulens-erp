import { getWorkflow } from "@/lib/aiRuntime/runtime/registry";
import { runWorkflow } from "@/lib/aiRuntime/runtime/executor";
import type { WorkflowRunEnvelope } from "@/lib/aiRuntime/contracts/outputContract";

/**
 * A.1's load-bearing rule, as code: **a chat-triggered run is identical to an event-triggered
 * run**. This function does nothing but assemble a `TriggerEvent` and call `runWorkflow()` — the
 * exact same function `app/api/cron/**` and every `safeEmitEvent()` call uses. There is no
 * separate "chat executor," no bypass of `decideAutonomy()`, no different `AiWorkflowPolicy`
 * lookup. The only thing that differs from an event trigger is `triggerSource: "chat"` recorded
 * on the payload — never read by the gate, only by anything downstream that wants to know how a
 * run started.
 */

export class ChatWorkflowNotFoundError extends Error {}

export async function runWorkflowFromChat(workflowId: string, eventKey: string, tenantId: string, userId: string | undefined, parameters: Record<string, unknown>): Promise<WorkflowRunEnvelope> {
  const workflow = getWorkflow(workflowId);
  if (!workflow) throw new ChatWorkflowNotFoundError(`No registered workflow "${workflowId}"`);

  return runWorkflow(workflow, {
    tenantId,
    eventKey,
    payload: { ...parameters, actingUserId: userId, triggerSource: "chat" },
  });
}

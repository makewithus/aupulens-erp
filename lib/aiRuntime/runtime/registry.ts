import type { WorkflowDefinition } from "@/lib/aiRuntime/workflows/types";

/**
 * The workflow registry — separate from lib/aiRuntime/tools/registry.ts
 * (which registers ERP tools, a different concept). Maps a workflow id to
 * its definition and indexes by event key so the event bus can find every
 * workflow subscribed to a given `eventKey` in O(1).
 */

const byId = new Map<string, WorkflowDefinition<any, any, any>>();
const byEventKey = new Map<string, Set<string>>();

export function registerWorkflow(def: WorkflowDefinition<any, any, any>): void {
  byId.set(def.id, def);
  for (const key of def.eventKeys) {
    if (!byEventKey.has(key)) byEventKey.set(key, new Set());
    byEventKey.get(key)!.add(def.id);
  }
}

export function getWorkflow(id: string): WorkflowDefinition<any, any, any> | undefined {
  return byId.get(id);
}

export function getWorkflowsForEventKey(eventKey: string): WorkflowDefinition<any, any, any>[] {
  const ids = byEventKey.get(eventKey);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => byId.get(id))
    .filter((d): d is WorkflowDefinition<any, any, any> => Boolean(d));
}

export function listWorkflows(): WorkflowDefinition<any, any, any>[] {
  return Array.from(byId.values());
}

/** Test-only escape hatch — never call from workflow code. */
export function __clearWorkflowRegistryForTests(): void {
  byId.clear();
  byEventKey.clear();
}

/**
 * Visual ERP Builder graph → AutomationRule compiler (6.10).
 *
 * The React Flow canvas (components/crm/VisualWorkflowBuilder.tsx) is just a
 * visual editor over the SAME backend the form-based builder
 * (NewAutomationRuleModal) already uses. This pure function turns the canvas's
 * node graph into the exact `{ name, entity, trigger, conditions, actions }`
 * payload that POST /api/crm/automations expects — so both builders create the
 * same real, executing rules. Kept pure/framework-free so it's unit-tested
 * without React Flow.
 */
import { RULE_TRIGGERS, RULE_ENTITIES, RULE_OPERATORS, RULE_ACTIONS } from "@/lib/crm/automationVocabulary";

export type WorkflowNodeData =
  | { kind: "trigger"; trigger: string; entity: string }
  | { kind: "condition"; field: string; operator: string; value: string }
  | { kind: "action"; actionType: string; payload: Record<string, unknown> | string };

export interface WorkflowNode {
  id: string;
  data: WorkflowNodeData;
}

export interface CompiledRule {
  name: string;
  entity: string;
  trigger: string;
  conditions: { field: string; operator: string; value: unknown }[];
  actions: { type: string; payload: Record<string, unknown> }[];
}

export type CompileResult =
  | { ok: true; rule: CompiledRule; warnings: string[] }
  | { ok: false; error: string };

function coercePayload(p: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof p === "string") {
    if (!p.trim()) return {};
    try {
      const parsed = JSON.parse(p);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return p && typeof p === "object" ? p : {};
}

export function compileGraphToRule(name: string, nodes: WorkflowNode[]): CompileResult {
  if (!name || !name.trim()) return { ok: false, error: "Give the workflow a name before publishing." };

  const triggers = nodes.filter((n) => n.data.kind === "trigger");
  if (triggers.length === 0) return { ok: false, error: "Add a Trigger node — a workflow needs exactly one starting event." };
  if (triggers.length > 1) return { ok: false, error: "A workflow can only have one Trigger node." };

  const triggerData = triggers[0].data as Extract<WorkflowNodeData, { kind: "trigger" }>;
  const warnings: string[] = [];

  let trigger = triggerData.trigger;
  if (!(RULE_TRIGGERS as readonly string[]).includes(trigger)) {
    warnings.push(`Unknown trigger "${trigger}" → defaulted to record_created.`);
    trigger = "record_created";
  }
  let entity = triggerData.entity;
  if (!(RULE_ENTITIES as readonly string[]).includes(entity)) {
    warnings.push(`Unknown entity "${entity}" → defaulted to Lead.`);
    entity = "Lead";
  }

  const conditions = nodes
    .filter((n): n is WorkflowNode & { data: Extract<WorkflowNodeData, { kind: "condition" }> } => n.data.kind === "condition")
    .map((n) => n.data)
    .filter((c) => {
      const valid = !!c.field?.trim() && (RULE_OPERATORS as readonly string[]).includes(c.operator);
      if (!valid && c.field?.trim()) warnings.push(`Dropped condition on "${c.field}" (invalid operator "${c.operator}").`);
      return valid;
    })
    .map((c) => ({ field: c.field.trim(), operator: c.operator, value: c.value }));

  const actions = nodes
    .filter((n): n is WorkflowNode & { data: Extract<WorkflowNodeData, { kind: "action" }> } => n.data.kind === "action")
    .map((n) => n.data)
    .filter((a) => {
      const valid = (RULE_ACTIONS as readonly string[]).includes(a.actionType);
      if (!valid) warnings.push(`Dropped unsupported action "${a.actionType}".`);
      return valid;
    })
    .map((a) => ({ type: a.actionType, payload: coercePayload(a.payload) }));

  if (actions.length === 0) return { ok: false, error: "Add at least one Action node — a workflow needs something to do." };

  return { ok: true, rule: { name: name.trim(), entity, trigger, conditions, actions }, warnings };
}

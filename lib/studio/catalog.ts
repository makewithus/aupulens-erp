/**
 * Aupulens Studio catalog — the trigger/action/operator vocabulary the builder
 * UI renders and the engine validates against. Pure metadata (no DB/AI).
 */

import { CONDITION_OPERATORS } from "@/lib/studio/conditions";

export const WORKFLOW_TRIGGER_TYPE = {
  MANUAL: "manual", // run on demand / test
  EVENT: "event", // fired by a system event key
} as const;

export type WorkflowTriggerType =
  (typeof WORKFLOW_TRIGGER_TYPE)[keyof typeof WORKFLOW_TRIGGER_TYPE];

/**
 * Event keys other parts of the ERP can emit via dispatchEvent(). These are the
 * ones actually wired today; more can be added by calling dispatchEvent with a
 * new key (the builder lets a user type any key, so a workflow can be authored
 * ahead of the emit being wired).
 */
export const WORKFLOW_EVENTS: { key: string; label: string }[] = [
  { key: "integration.webhook", label: "Integration webhook received (Aupulens Connect)" },
  { key: "customer.created", label: "Customer created" },
  { key: "invoice.created", label: "Invoice created" },
  { key: "stock.low", label: "Stock level low" },
];

export const WORKFLOW_ACTION_TYPE = {
  LOG: "log",
  NOTIFY: "notify",
  WEBHOOK: "webhook",
  AI_SUMMARIZE: "ai_summarize",
  SET_CONTEXT: "set_context",
} as const;

export type WorkflowActionType =
  (typeof WORKFLOW_ACTION_TYPE)[keyof typeof WORKFLOW_ACTION_TYPE];

export const WORKFLOW_ACTION_TYPE_VALUES = Object.values(WORKFLOW_ACTION_TYPE);

export interface ActionParamSpec {
  key: string;
  label: string;
  required: boolean;
  placeholder?: string;
  supportsTemplating?: boolean;
}

export interface ActionSpec {
  type: WorkflowActionType;
  label: string;
  description: string;
  params: ActionParamSpec[];
}

export const ACTION_SPECS: ActionSpec[] = [
  {
    type: WORKFLOW_ACTION_TYPE.LOG,
    label: "Log message",
    description: "Record a message in the run history (useful for testing & audit).",
    params: [{ key: "message", label: "Message", required: true, supportsTemplating: true, placeholder: "New customer {{payload.name}}" }],
  },
  {
    type: WORKFLOW_ACTION_TYPE.NOTIFY,
    label: "Notify (in-app)",
    description: "Create an in-app notification for the workflow owner.",
    params: [
      { key: "title", label: "Title", required: true, supportsTemplating: true },
      { key: "message", label: "Message", required: true, supportsTemplating: true },
    ],
  },
  {
    type: WORKFLOW_ACTION_TYPE.WEBHOOK,
    label: "Call webhook",
    description: "POST the run context to an external URL (optionally HMAC-signed).",
    params: [
      { key: "url", label: "URL", required: true, placeholder: "https://..." },
      { key: "secret", label: "Signing secret (optional)", required: false },
    ],
  },
  {
    type: WORKFLOW_ACTION_TYPE.AI_SUMMARIZE,
    label: "AI summarize",
    description: "Ask AI to analyze the context; the result is stored for later steps.",
    params: [
      { key: "instruction", label: "Instruction", required: true, supportsTemplating: true, placeholder: "Summarize this record and flag any risk" },
      { key: "outputKey", label: "Store result as", required: true, placeholder: "aiResult" },
    ],
  },
  {
    type: WORKFLOW_ACTION_TYPE.SET_CONTEXT,
    label: "Set variable",
    description: "Set a context variable later steps/conditions can reference.",
    params: [
      { key: "key", label: "Variable name", required: true },
      { key: "value", label: "Value", required: true, supportsTemplating: true },
    ],
  },
];

export function getActionSpec(type: string): ActionSpec | undefined {
  return ACTION_SPECS.find((a) => a.type === type);
}

/** Validate a step's params against its spec. Returns an error string or null. */
export function validateStep(step: { type: string; params?: Record<string, unknown> }): string | null {
  const spec = getActionSpec(step.type);
  if (!spec) return `Unknown action type "${step.type}"`;
  for (const p of spec.params) {
    if (p.required) {
      const v = step.params?.[p.key];
      if (v === undefined || v === null || String(v).trim() === "") {
        return `${spec.label}: "${p.label}" is required`;
      }
    }
  }
  return null;
}

export function studioCatalog() {
  return {
    triggerTypes: Object.values(WORKFLOW_TRIGGER_TYPE),
    events: WORKFLOW_EVENTS,
    operators: CONDITION_OPERATORS,
    actions: ACTION_SPECS,
  };
}
